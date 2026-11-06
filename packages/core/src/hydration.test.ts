import { describe, expect, it } from "vitest";

import { entryOf, fetchEntry, subscribeEntry } from "./entry.ts";
import { fail, isQueryFailure } from "./fail.ts";
import {
	type DehydratedState,
	dehydrate,
	dehydrateStream,
	hydrate,
	RedactedError,
} from "./hydration.ts";
import {
	createBackend,
	flush,
	issues,
	testClient,
	advance,
} from "./test-utils.ts";

/** What crossing a network does to the promises in a dehydrated state. */
function send(state: DehydratedState): DehydratedState {
	return {
		entries: state.entries.map((entry) => ({
			...structuredClone({ ...entry, promise: undefined }),
			promise: entry.promise,
		})),
	};
}

describe("dehydrate and hydrate", () => {
	it("moves data, with its key and time", async () => {
		const backend = createBackend();
		const server = testClient({ isServer: true });
		const done = fetchEntry(entryOf(server, backend.issueQuery, { id: 1 }));
		backend.respondAll();
		await done;
		const state = dehydrate(server);

		expect(state.entries).toEqual([
			{
				data: { author: "ada", id: 1, title: "First" },
				queryKey: [{ group: "issues" }, "byId", { id: 1 }],
				updatedAt: server.clock.now(),
			},
		]);
		const browser = testClient({ staleTime: Infinity });
		hydrate(browser, send(state));
		const entry = entryOf(browser, backend.issueQuery, { id: 1 });

		expect(entry.state).toMatchObject({ data: { id: 1 }, status: "success" });
		expect(entry.thenable.status).toBe("fulfilled");
	});

	it("keeps newer data the receiver has", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const done = fetchEntry(entry);
		backend.respondAll();
		await done;
		using _reader = { [Symbol.dispose]: subscribeEntry(entry, () => {}) };
		hydrate(client, {
			entries: [
				{
					data: { author: "old", id: 1, title: "Old" },
					queryKey: [issues, "byId", { id: 1 }],
					updatedAt: 1,
				},
			],
		});

		expect(entry.state.data).toMatchObject({ title: "First" });
		expect(backend.requests).toHaveLength(1);
	});

	it("moves fail() values, and leaves out defects and idle entries", async () => {
		const backend = createBackend();
		const server = testClient({ isServer: true });
		const missing = fetchEntry(entryOf(server, backend.issueQuery, { id: 9 }));
		const broken = fetchEntry(entryOf(server, backend.issueQuery, { id: 1 }));
		entryOf(server, backend.issueQuery, { id: 2 });
		backend.requests[0]?.respond();
		backend.requests[1]?.fail(new Error("down"));
		await Promise.all([missing, broken]);
		const state = dehydrate(server);

		expect(state.entries).toEqual([
			expect.objectContaining({ fail: fail({ _tag: "NotFound", id: 9 }) }),
		]);
		const browser = testClient();
		hydrate(browser, state);
		const entry = entryOf(browser, backend.issueQuery, { id: 9 });

		expect(entry.state.status).toBe("error");
		await expect(entry.thenable).rejects.toSatisfy(isQueryFailure);
	});

	it("skips entries already sent in the same transfer", async () => {
		const backend = createBackend();
		const server = testClient({ isServer: true });
		const done = fetchEntry(entryOf(server, backend.issueQuery, { id: 1 }));
		backend.respondAll();
		await done;
		const sent = new Set<string>();

		expect(dehydrate(server, { sent }).entries).toHaveLength(1);
		expect(dehydrate(server, { sent }).entries).toHaveLength(0);
	});
});

describe("pending entries", () => {
	it("resume the sender's request instead of fetching again", async () => {
		const backend = createBackend();
		const server = testClient({ isServer: true });
		void fetchEntry(entryOf(server, backend.issueQuery, { id: 1 }));
		const state = dehydrate(server);
		const browser = testClient();
		hydrate(browser, send(state));
		const entry = entryOf(browser, backend.issueQuery, { id: 1 });

		expect(entry.state.isFetching).toBe(true);
		backend.respondAll();
		await expect(entry.thenable).resolves.toMatchObject({ title: "First" });
		expect(backend.requests).toHaveLength(0);
	});

	it("carry fail() values, and redact defects unless told to keep them", async () => {
		const backend = createBackend();
		const server = testClient({ isServer: true });
		void fetchEntry(entryOf(server, backend.issueQuery, { id: 9 }));
		void fetchEntry(entryOf(server, backend.issueQuery, { id: 1 }));
		const redacted = dehydrate(server);
		const kept = dehydrate(server, { keepErrors: true });
		const defect = new Error("secret");
		backend.requests[0]?.respond();
		backend.requests[1]?.fail(defect);

		await expect(redacted.entries[0]?.promise).resolves.toMatchObject({
			fail: { _tag: "NotFound" },
		});
		await expect(redacted.entries[1]?.promise).rejects.toBeInstanceOf(
			RedactedError,
		);
		await expect(kept.entries[1]?.promise).rejects.toBe(defect);
		const browser = testClient();
		hydrate(browser, redacted);
		const entry = entryOf(browser, backend.issueQuery, { id: 9 });
		await flush();

		expect(entry.state.status).toBe("error");
	});

	it("wait for the sender if the receiver has data, and take it if newer", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const first = fetchEntry(entry);
		backend.respondAll();
		await first;
		const later = Promise.withResolvers<{ data: unknown; updatedAt: number }>();
		const failing = Promise.withResolvers<{
			data: unknown;
			updatedAt: number;
		}>();
		hydrate(client, {
			entries: [
				{
					promise: later.promise,
					queryKey: [issues, "byId", { id: 1 }],
					updatedAt: 0,
				},
				{
					promise: failing.promise,
					queryKey: [issues, "byId", { id: 1 }],
					updatedAt: 0,
				},
			],
		});
		advance(client, 10);
		later.resolve({
			data: { id: 1, title: "Server" },
			updatedAt: client.clock.now(),
		});
		failing.reject(new Error("down"));
		await flush();

		expect(entry.state.data).toMatchObject({ title: "Server" });
	});

	it("resume the sender's request after the receiver's own failed", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const first = fetchEntry(entry);
		backend.requests[0]?.fail(new Error("down"));
		await first;
		hydrate(client, {
			entries: [
				{
					promise: Promise.resolve({ data: { id: 1 }, updatedAt: 5 }),
					queryKey: [issues, "byId", { id: 1 }],
					updatedAt: 0,
				},
			],
		});

		expect(entry.thenable.status).toBe("pending");
		await expect(entry.thenable).resolves.toEqual({ id: 1 });
	});

	it("take a sender's fail() over the receiver's own error", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const first = fetchEntry(entry);
		backend.requests[0]?.fail(new Error("down"));
		await first;
		hydrate(client, {
			entries: [
				{
					fail: fail({ _tag: "NotFound" }),
					queryKey: [issues, "byId", { id: 1 }],
					updatedAt: 5,
				},
			],
		});

		expect(entry.state.error).toEqual(fail({ _tag: "NotFound" }));
		await expect(entry.thenable).rejects.toSatisfy(isQueryFailure);
	});

	it("ignore a sender's fail() when the receiver has data", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const first = fetchEntry(entry);
		backend.respondAll();
		await first;
		hydrate(client, {
			entries: [
				{
					fail: fail({ _tag: "NotFound" }),
					queryKey: [issues, "byId", { id: 1 }],
					updatedAt: 5,
				},
			],
		});

		expect(entry.state.status).toBe("success");
	});
});

describe("dehydrateStream", () => {
	it("sends the cache, then entries as they start, until closed", async () => {
		const backend = createBackend();
		const server = testClient({ isServer: true });
		const done = fetchEntry(entryOf(server, backend.issueQuery, { id: 1 }));
		backend.respondAll();
		await done;
		const stream = dehydrateStream(server);

		expect(stream.initial.entries).toHaveLength(1);
		const reader = stream.updates.getReader();
		void fetchEntry(entryOf(server, backend.issueQuery, { id: 2 }));
		void fetchEntry(entryOf(server, backend.issueQuery, { id: 1 }));
		void fetchEntry(entryOf(server, backend.issueQuery, { id: 4 }));
		const update = await reader.read();

		expect(update.value?.entries.map((entry) => entry.queryKey[2])).toEqual([
			{ id: 2 },
			{ id: 4 },
		]);
		entryOf(server, backend.issueQuery, { id: 3 });
		stream.close();
		stream.close();
		expect((await reader.read()).done).toBe(true);
		backend.respondAll();
	});
});
