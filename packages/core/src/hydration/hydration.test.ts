/**
 * Hydration moves cache entries from a server client to a browser one.
 * Nothing in the kernel imports it, so apps that don't server-render
 * don't bundle it.
 *
 * - `dehydrate(client)` returns the entries worth sending (`canDehydrate`):
 *   data, and entries still loading, with a promise of their result. A
 *   request that then throws crosses as a `RedactedError` unless
 *   `keepErrors`. Errors and hashes already in `sent` stay behind, and so does `meta`, which comes from the factory.
 * - `hydrate(client, state)` writes entries by `queryKey`, and takes only
 *   data newer than what the browser has. A pending entry the browser has
 *   nothing for adopts the sender's promise as its request instead of
 *   fetching; one with data or a request of its own waits for the
 *   sender's, takes it if newer, and refetches if it failed. A read entry
 *   that is stale after hydrating refetches.
 * - `dehydrateStream(client)` sends the cache, then entries as they start
 *   or settle, batched per microtask, until `close()`.
 */
import { describe, expect, it } from "vitest";

import {
	type DehydratedResult,
	type DehydratedState,
	dehydrate,
	dehydrateStream,
	hydrate,
	RedactedError,
} from "./hydration.ts";
import {
	getData,
	load,
	prefetch,
	removeOne,
	resetAll,
	resetOne,
	revalidate,
	setData,
	swr,
	waterfallHandle,
} from "../index.ts";
import {
	advance,
	createBackend,
	flush,
	issues,
	read,
	testClient,
} from "../test-utils.ts";

/** What crossing a network does to a dehydrated state: everything but the promises is copied. */
function send(state: DehydratedState): DehydratedState {
	return {
		entries: state.entries.map((entry) => ({
			...structuredClone({ ...entry, promise: undefined }),
			promise: entry.promise,
		})),
	};
}

/** A server client that loaded issue 1, and the handles it rendered. */
async function server() {
	const backend = createBackend();
	const client = testClient({ isServer: true });
	const loading = load(client, {
		issue: prefetch(backend.issueQuery, { id: 1 }),
	});
	await backend.respondAll();
	const [handles] = await loading;
	return { backend, client, handles };
}

describe("a server-rendered page", () => {
	it("hands its data to the browser, which reads it without fetching", async () => {
		const page = await server();
		const state = dehydrate(page.client);

		expect(state.entries).toEqual([
			{
				data: { author: "ada", id: 1, title: "First" },
				queryKey: ["issues", "byId", { id: 1 }],
				updatedAt: page.client.clock.now(),
			},
		]);
		const browser = testClient({ defaults: { staleTime: Infinity } });
		hydrate(browser, send(state));
		const view = read(browser, page.backend.issueQuery, page.handles.issue);

		expect(view.result.current[0]).toMatchObject({
			status: "fulfilled",
			value: { title: "First" },
		});
		expect(page.backend.requests).toHaveLength(0);
	});

	it("leaves out errors and what it already sent", async () => {
		const backend = createBackend();
		const client = testClient({ isServer: true });
		const loading = load(client, {
			broken: prefetch(backend.issueQuery, { id: 1 }),
			loaded: prefetch(backend.issueQuery, { id: 2 }),
		});
		backend.requests[0]?.fail(new Error("down"));
		await backend.respondAll();
		await loading;
		const sent = new Set<string>();
		const state = dehydrate(client, { sent });

		expect(state.entries).toEqual([
			expect.objectContaining({ queryKey: issues("byId", { id: 2 }) }),
		]);
		expect(dehydrate(client, { sent }).entries).toHaveLength(0);
		expect(
			dehydrate(client, { filter: (entry) => entry.state.status === "error" })
				.entries,
		).toHaveLength(0);
	});

	it("streams queries still loading, so the browser resumes them instead of fetching again", async () => {
		const backend = createBackend();
		const client = testClient({ isServer: true });
		const [handles] = await load(client, {
			issue: prefetch(backend.issueQuery, { id: 1 }),
		});
		const browser = testClient();
		hydrate(browser, send(dehydrate(client)));
		const view = read(browser, backend.issueQuery, handles.issue);

		expect(view.result.current[1].isFetching).toBe(true);
		expect(backend.requests).toHaveLength(1);
		await backend.respondAll();
		expect(view.result.current[0]).toMatchObject({ value: { title: "First" } });
		expect(backend.requests).toHaveLength(0);
	});

	it("keeps resuming the sender's request through a reset that comes before any reader", async () => {
		const backend = createBackend();
		const client = testClient({ isServer: true });
		await load(client, { issue: prefetch(backend.issueQuery, { id: 1 }) });
		const browser = testClient();
		hydrate(browser, send(dehydrate(client)));
		const resetting = resetAll(browser);
		await backend.respondAll();
		await resetting;

		expect(getData(browser, backend.issueQuery, { id: 1 })).toMatchObject({
			title: "First",
		});
		expect(backend.requests).toHaveLength(0);
	});

	it("streams errors redacted unless it keeps them", async () => {
		const backend = createBackend();
		const client = testClient({ isServer: true });
		const [handles] = await load(client, {
			broken: prefetch(backend.issueQuery, { id: 1 }),
		});
		const redacted = dehydrate(client);
		const kept = dehydrate(client, { keepErrors: true });
		const defect = new Error("secret");
		backend.requests[0]?.fail(defect);
		await backend.respondAll();

		await expect(kept.entries[0]?.promise).rejects.toBe(defect);
		const browser = testClient();
		hydrate(browser, redacted);
		const broken = read(browser, backend.issueQuery, handles.broken);
		await flush();

		expect(broken.result.current[0]).toMatchObject({
			reason: new RedactedError('["issues","byId",{"id":1}]'),
			status: "rejected",
		});
	});
});

describe("hydrating a query the browser has", () => {
	it("keeps the browser's newer data, and refetches a read stale query", async () => {
		const backend = createBackend();
		const client = testClient({ defaults: { staleTime: 10 } });
		const loading = load(client, {
			fresh: swr(backend.issueQuery, { id: 1 }),
			stale: swr(backend.issueQuery, { id: 2 }),
			unread: swr(backend.issueQuery, { id: 3 }),
		});
		await backend.respondAll();
		const [handles] = await loading;
		const older = (id: number) => ({
			data: { author: "old", id, title: "Old" },
			queryKey: issues("byId", { id }),
			updatedAt: 1,
		});
		hydrate(client, {
			entries: [{ ...older(4), updatedAt: client.clock.now() }],
		});
		advance(client, 10);
		read(client, backend.issueQuery, handles.stale);
		setData(
			client,
			backend.issueQuery,
			{ id: 1 },
			{
				author: "ada",
				id: 1,
				title: "Edited",
			},
		);
		read(client, backend.issueQuery, handles.fresh);
		hydrate(client, { entries: [1, 2, 3, 4].map(older) });

		expect(backend.requests.map((request) => request.id)).toEqual([2]);
		expect(getData(client, backend.issueQuery, { id: 3 })?.title).toBe("Third");
		await backend.respondAll();
	});

	it("waits for the sender's request, takes its data if newer, and refetches if it failed", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			issue: swr(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		const [handles] = await loading;
		read(client, backend.issueQuery, handles.issue);
		const newer = Promise.withResolvers<DehydratedResult>();
		const failing = Promise.withResolvers<DehydratedResult>();
		hydrate(client, {
			entries: [newer, failing].map((request) => ({
				promise: request.promise,
				queryKey: issues("byId", { id: 1 }),
				updatedAt: 0,
			})),
		});
		advance(client, 10);
		newer.resolve({
			data: { author: "ada", id: 1, title: "Server" },
			updatedAt: client.clock.now(),
		});
		failing.reject(new RedactedError("issue"));
		await flush();

		expect(getData(client, backend.issueQuery, { id: 1 })?.title).toBe(
			"Server",
		);
		expect(backend.requests).toHaveLength(1);
		await backend.respondAll();
	});

	it("resumes the sender's request after the browser's own failed", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			issue: prefetch(backend.issueQuery, { id: 1 }),
		});
		backend.requests[0]?.fail(new Error("down"));
		const [handles] = await loading;
		await flush();
		hydrate(client, {
			entries: [
				{
					promise: Promise.resolve({
						data: { author: "ada", id: 1, title: "Server" },
						updatedAt: 5,
					}),
					queryKey: issues("byId", { id: 1 }),
					updatedAt: 0,
				},
			],
		});
		const view = read(client, backend.issueQuery, handles.issue);

		expect(view.result.current[1].isFetching).toBe(true);
		await flush();
		expect(view.result.current[0]).toMatchObject({
			value: { title: "Server" },
		});
	});

	it("drops a sender's request whose query the browser removed first", async () => {
		const client = testClient();
		const backend = createBackend();
		const ok = Promise.withResolvers<DehydratedResult>();
		const bad = Promise.withResolvers<DehydratedResult>();
		hydrate(client, {
			entries: [
				{
					promise: ok.promise,
					queryKey: issues("byId", { id: 1 }),
					updatedAt: 0,
				},
				{
					promise: bad.promise,
					queryKey: issues("byId", { id: 2 }),
					updatedAt: 0,
				},
			],
		});
		removeOne(client, backend.issueQuery, { id: 1 });
		removeOne(client, backend.issueQuery, { id: 2 });
		ok.resolve({ data: { author: "ada", id: 1, title: "Late" }, updatedAt: 5 });
		bad.reject(new Error("late"));
		await flush();

		expect(getData(client, backend.issueQuery, { id: 1 })).toBeUndefined();
		const view = read(
			client,
			backend.issueQuery,
			waterfallHandle(backend.issueQuery, { id: 2 }),
		);
		await backend.respondAll();
		expect(view.result.current[0]).toMatchObject({
			value: { title: "Second" },
		});
	});
});

describe("streaming the cache", () => {
	it("sends the cache, then queries as they start, until closed", async () => {
		const page = await server();
		const stream = dehydrateStream(page.client);

		expect(stream.initial.entries).toHaveLength(1);
		const reader = stream.updates.getReader();
		void load(page.client, {
			again: revalidate(page.backend.issueQuery, { id: 1 }),
			four: prefetch(page.backend.issueQuery, { id: 4 }),
			two: prefetch(page.backend.issueQuery, { id: 2 }),
		});
		const update = await reader.read();

		expect(update.value?.entries.map((entry) => entry.queryKey[2])).toEqual([
			{ id: 4 },
			{ id: 2 },
		]);
		removeOne(page.client, page.backend.issueQuery, { id: 4 });
		setData(
			page.client,
			page.backend.issueQuery,
			{ id: 5 },
			{
				author: "ada",
				id: 5,
				title: "Fifth",
			},
		);
		void resetOne(page.client, page.backend.issueQuery, { id: 5 });
		await flush();
		stream.close();
		stream.close();
		expect((await reader.read()).done).toBe(true);
		await page.backend.respondAll();
	});

	it("sends the last changes when it closes", async () => {
		const backend = createBackend();
		const client = testClient({ isServer: true });
		const stream = dehydrateStream(client);
		const reader = stream.updates.getReader();
		void load(client, { one: prefetch(backend.issueQuery, { id: 1 }) });
		stream.close();

		expect((await reader.read()).value?.entries).toHaveLength(1);
		expect((await reader.read()).done).toBe(true);
		await backend.respondAll();
	});
});
