/**
 * The verbs: free functions that take the client first. `…One` takes a
 * factory and its full input; `…Many` takes a target or a list of them
 * (how targets match: `./keys/targets.test.ts`); `…All` takes everything.
 *
 * - `invalidate…` records stamps (`entry.ts`, `invalidate`): matching
 *   entries go stale, read ones refetch now, once however many stamps
 *   cover them, and the promise resolves when those refetches settle.
 * - `reset…` drops data and errors; read or loading entries start over.
 * - `remove…` drops entries and aborts their requests.
 * - `setData` writes through the same `write` a response uses, so readers
 *   update and structural sharing applies. A write made while a request
 *   ran wins over that request's answer. `getData` reads; `isFetching`
 *   counts entries with a request in flight.
 */
import type { JsonValue } from "fast-check";
import { describe, expect, it } from "vitest";

import {
	getData,
	invalidateAll,
	invalidateMany,
	invalidateOne,
	isFetching,
	load,
	prefetch,
	queryOptions,
	removeAll,
	removeMany,
	removeOne,
	resetAll,
	resetMany,
	resetOne,
	setData,
	swr,
	waterfallHandle,
} from "./index.ts";
import {
	author,
	cached,
	createBackend,
	drafts,
	featured,
	flush,
	type Issue,
	issues,
	read,
	testClient,
} from "./test-utils.ts";

describe("invalidation", () => {
	it("refetches a read query at once, and leaves the rest for their next load", async () => {
		const cache = await cached();
		const reader = read(
			cache.client,
			cache.backend.issueQuery,
			cache.handles.one,
		);
		const invalidating = invalidateOne(cache.client, cache.backend.issueQuery, {
			id: 1,
		});

		expect(cache.backend.requests.map((request) => request.id)).toEqual([1]);
		await cache.backend.respondAll();
		await invalidating;
		reader.unmount();
		await invalidateOne(cache.client, cache.backend.issueQuery, { id: 2 });
		expect(cache.backend.requests).toHaveLength(0);
		expect(await cache.refetched()).toEqual(["two"]);
	});

	it("refetches a read query that several targets of a list cover once, and resolves when every refetch settles", async () => {
		const cache = await cached();
		const one = read(cache.client, cache.backend.issueQuery, cache.handles.one);
		const two = read(cache.client, cache.backend.issueQuery, cache.handles.two);
		let settled = false;
		const invalidating = invalidateMany(cache.client, [
			issues,
			cache.backend.issueQuery,
			[cache.backend.issueQuery, { id: 1 }],
			[author, "ada"],
		]).then(() => {
			settled = true;
		});

		expect(cache.backend.requests.map((request) => request.id)).toEqual([1, 2]);
		cache.backend.requests.shift()?.respond();
		await flush();
		expect(settled).toBe(false);
		await cache.backend.respondAll();
		await invalidating;
		expect(settled).toBe(true);
		one.unmount();
		two.unmount();
		expect(await cache.refetched()).toEqual(["draft"]);
	});

	it("invalidates everything", async () => {
		const cache = await cached();
		await invalidateAll(cache.client);

		expect(await cache.refetched()).toEqual(["draft", "one", "two"]);
	});

	it("doesn't count data that was requested after the invalidation", async () => {
		const cache = await cached();
		await invalidateMany(cache.client, issues);
		expect(await cache.refetched()).toEqual(["draft", "one", "two"]);

		expect(await cache.refetched()).toEqual([]);
	});
});

describe("reset and remove", () => {
	it("reset one query, a target's, or all of them", async () => {
		const cache = await cached();
		await resetOne(cache.client, cache.backend.issueQuery, { id: 1 });
		await resetOne(cache.client, cache.backend.issueQuery, { id: 7 });
		const has = () =>
			[
				getData(cache.client, cache.backend.issueQuery, { id: 1 }),
				getData(cache.client, cache.backend.issueQuery, { id: 2 }),
				getData(cache.client, cache.backend.draftQuery, { id: 3 }),
			].map((data) => data !== undefined);

		expect(has()).toEqual([false, true, true]);
		await resetMany(cache.client, cache.backend.issueQuery, { id: 2 });
		expect(has()).toEqual([false, false, true]);
		await resetMany(cache.client, []);
		expect(has()).toEqual([false, false, true]);
		await resetMany(cache.client, [featured, [cache.backend.issueQuery, {}]]);
		expect(has()).toEqual([false, false, false]);
		await resetAll(cache.client);
		expect(has()).toEqual([false, false, false]);
	});

	it("reset a query loading for nobody by starting it over", async () => {
		const backend = createBackend();
		const client = testClient();
		void load(client, { issue: prefetch(backend.issueQuery, { id: 1 }) });
		const [old] = backend.requests;
		const resetting = resetMany(client, issues);

		expect(old?.signal.aborted).toBe(true);
		await backend.respondAll();
		await resetting;
		expect(getData(client, backend.issueQuery, { id: 1 })?.title).toBe("First");
	});

	it("remove one query, a target's, or all, aborting their requests", async () => {
		const cache = await cached();
		removeOne(cache.client, cache.backend.issueQuery, { id: 1 });
		removeOne(cache.client, cache.backend.issueQuery, { id: 7 });
		const has = () =>
			[
				getData(cache.client, cache.backend.issueQuery, { id: 1 }),
				getData(cache.client, cache.backend.issueQuery, { id: 2 }),
				getData(cache.client, cache.backend.draftQuery, { id: 3 }),
			].map((data) => data !== undefined);

		expect(has()).toEqual([false, true, true]);
		removeMany(cache.client, [drafts, [author, "ada"]]);
		expect(has()).toEqual([false, true, false]);
		const loading = load(cache.client, {
			one: swr(cache.backend.issueQuery, { id: 1 }),
		}).catch((error: unknown) => error);
		removeAll(cache.client);
		expect(has()).toEqual([false, false, false]);
		expect(cache.backend.requests[0]?.signal.aborted).toBe(true);
		expect(await loading).toMatchObject({ name: "AbortError" });
	});
});

/** What these tests write with `setData`. */
type Data = Date | JsonValue | ReadonlyArray<number>;

const any = () =>
	queryOptions({ queryFn: (): Data => null, queryKey: issues("any") });

describe("data", () => {
	it("writes a query's data from its previous data, or outright", async () => {
		const cache = await cached();
		setData(cache.client, cache.backend.issueQuery, { id: 1 }, (issue) => ({
			author: "ada",
			id: 1,
			title: `${issue?.title} edited`,
		}));
		setData(cache.client, cache.backend.issueQuery, { id: 5 }, (issue) => ({
			author: "cy",
			id: 5,
			title: issue?.title ?? "Fifth",
		}));
		setData(
			cache.client,
			cache.backend.issueQuery,
			{ id: 6 },
			{
				author: "cy",
				id: 6,
				title: "Sixth",
			},
		);

		expect(
			[1, 5, 6, 7].map(
				(id) => getData(cache.client, cache.backend.issueQuery, { id })?.title,
			),
		).toEqual(["First edited", "Fifth", "Sixth", undefined]);
		expect(await cache.refetched()).toEqual([]);
	});

	it("writes a query without an input, from three arguments", () => {
		const client = testClient();
		const optional = (input?: { readonly id: number }) =>
			queryOptions({
				queryFn: (): Data => null,
				queryKey: issues("optional", input),
			});
		setData(client, any, [1]);
		setData(client, any, (previous) => [
			...(Array.isArray(previous) ? previous : []),
			2,
		]);
		setData(client, optional, "none");
		setData(client, optional, { id: 1 }, "one");

		expect(getData(client, any)).toEqual([1, 2]);
		expect(getData(client, optional)).toBe("none");
		expect(getData(client, optional, { id: 1 })).toBe("one");
	});

	it("keeps data written while a request ran over the request's answer", async () => {
		const backend = createBackend();
		const client = testClient();
		const view = read(
			client,
			backend.issueQuery,
			waterfallHandle(backend.issueQuery, { id: 1 }),
		);
		await backend.respondAll();
		const refetching = view.result.current[1].refetch();
		const written: Issue = { author: "ada", id: 1, title: "Written live" };
		setData(client, backend.issueQuery, { id: 1 }, written);
		await backend.respondAll();
		await refetching;

		// A live writer sends every later change again; a dropped write never
		// comes back. So the write made after the request started wins.
		expect(getData(client, backend.issueQuery, { id: 1 })).toEqual(written);
		expect(view.result.current[1].isFetching).toBe(false);
		setData(
			client,
			backend.issueQuery,
			{ id: 1 },
			{
				...written,
				title: "Written before",
			},
		);
		const refetch = view.result.current[1].refetch();
		await backend.respondAll();
		await refetch;
		expect(getData(client, backend.issueQuery, { id: 1 })?.title).toBe("First");
	});

	it("reads nothing for a query that is cached without data", async () => {
		const backend = createBackend();
		const client = testClient();
		void load(client, { issue: prefetch(backend.issueQuery, { id: 1 }) });

		expect(getData(client, backend.issueQuery, { id: 1 })).toBeUndefined();
		await backend.respondAll();
	});

	it("counts the queries with a request in flight, of all or of a target", async () => {
		const cache = await cached();

		expect(isFetching(cache.client)).toBe(0);
		void invalidateAll(cache.client);
		const reader = read(
			cache.client,
			cache.backend.issueQuery,
			cache.handles.one,
		);
		expect(isFetching(cache.client)).toBe(1);
		expect(isFetching(cache.client, drafts)).toBe(0);
		expect(isFetching(cache.client, cache.backend.issueQuery)).toBe(1);
		await cache.backend.respondAll();
		reader.unmount();
	});
});
