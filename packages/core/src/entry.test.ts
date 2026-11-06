import { describe, expect, it } from "vitest";

import { createQueryClient, mount, systemClock } from "./client.ts";
import {
	abortError,
	adopt,
	entryForKey,
	entryOf,
	fetchEntry,
	isStale,
	remove,
	reset,
	subscribeEntry,
} from "./entry.ts";
import { fail, isQueryFailure } from "./fail.ts";
import { queryOptions } from "./options.ts";
import {
	createBackend,
	flush,
	issues,
	testClient,
	advance,
	timersOf,
} from "./test-utils.ts";

describe("entries", () => {
	it("settles the entry's thenable in place, so use() resumes on it", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const thenable = entry.thenable;

		expect(thenable.status).toBe("pending");
		const done = fetchEntry(entry);
		backend.respondAll();

		await expect(done).resolves.toEqual({ ok: true });
		expect(entry.thenable).toBe(thenable);
		expect(thenable).toMatchObject({ status: "fulfilled", value: { id: 1 } });
	});

	it("keeps unchanged data's identity across refetches", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const first = fetchEntry(entry);
		backend.respondAll();
		await first;
		const data = entry.state.data;
		const thenable = entry.thenable;
		const second = fetchEntry(entry);
		backend.respondAll();
		await second;

		expect(entry.state.data).toBe(data);
		expect(entry.thenable).toBe(thenable);
	});

	it("replaces data when structural sharing is off", async () => {
		const client = testClient({ structuralSharing: false });
		const fresh = () =>
			queryOptions({
				queryFn: () => ({ value: 1 }),
				queryKey: [issues, "fresh"],
			});
		const entry = entryOf(client, fresh, undefined);
		await fetchEntry(entry);
		const data = entry.state.data;
		await fetchEntry(entry);

		expect(entry.state.data).not.toBe(data);
		expect(entry.state.data).toEqual(data);
	});

	it("tells readers about changes once per microtask", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const seen: Array<string> = [];
		using _reader = {
			[Symbol.dispose]: subscribeEntry(entry, (state) =>
				seen.push(`${state.status} ${state.isFetching}`),
			),
		};
		const done = fetchEntry(entry);
		backend.respondAll();
		await done;
		await flush();

		expect(seen).toEqual(["pending true", "success false"]);
	});

	it("records failures and keeps data it had", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const first = fetchEntry(entry);
		backend.respondAll();
		await first;
		const second = fetchEntry(entry);
		backend.requests[0]?.fail(new Error("down"));

		await expect(second).resolves.toMatchObject({ ok: false });
		expect(entry.state).toMatchObject({ data: { id: 1 }, status: "error" });
		expect(entry.thenable.status).toBe("fulfilled");
	});

	it("rejects the thenable with a QueryFailure for fail()", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 9 });
		const done = fetchEntry(entry);
		backend.respondAll();
		await done;

		expect(entry.state.error).toEqual(fail({ _tag: "NotFound", id: 9 }));
		expect(entry.thenable.status).toBe("rejected");
		await expect(entry.thenable).rejects.toSatisfy(isQueryFailure);
		const again = fetchEntry(entry);

		expect(entry.thenable.status).toBe("pending");
		backend.respondAll();
		await again;
		expect(entry.thenable.status).toBe("rejected");
	});

	it("restarts a request when asked, and waiters get the new outcome", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const first = fetchEntry(entry);
		const [old] = backend.requests;
		const second = fetchEntry(entry, { restart: true });

		expect(old?.signal.aborted).toBe(true);
		expect(first).toBe(second);
		old?.respond();
		backend.store.set(1, { author: "ada", id: 1, title: "New" });
		backend.requests[1]?.respond();
		await first;

		expect(entry.state.data).toMatchObject({ title: "New" });
	});

	it("doesn't run a disabled query", async () => {
		const client = testClient();
		const disabled = () =>
			queryOptions({
				enabled: false,
				queryFn: () => 1,
				queryKey: [issues, "off"],
			});
		const entry = entryOf(client, disabled, undefined);

		await expect(fetchEntry(entry)).resolves.toEqual({ ok: true });
		expect(entry.state.isFetching).toBe(false);
	});

	it("aborts the request of a removed entry", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const done = fetchEntry(entry);
		remove(entry);
		remove(entry);

		expect(backend.requests[0]?.signal.aborted).toBe(true);
		await expect(done).resolves.toMatchObject({
			error: abortError(),
			ok: false,
		});
		backend.respondAll();
		await flush();
		expect(entry.state.hasData).toBe(false);
		expect(client["~entries"].size).toBe(0);
	});

	it("drops data on reset, and refetches if read", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const first = fetchEntry(entry);
		backend.respondAll();
		await first;

		await expect(reset(entry)).resolves.toEqual({ ok: true });
		expect(entry.state.hasData).toBe(false);
		expect(backend.requests).toHaveLength(0);
		using _reader = { [Symbol.dispose]: subscribeEntry(entry, () => {}) };
		const resetting = reset(entry);

		expect(backend.requests).toHaveLength(1);
		backend.respondAll();
		await resetting;
		expect(entry.state.hasData).toBe(true);
	});

	it("goes stale after staleTime", async () => {
		const client = testClient();
		const fresh = () =>
			queryOptions({
				queryFn: () => 1,
				queryKey: [issues, "fresh"],
				staleTime: 100,
			});
		const entry = entryOf(client, fresh, undefined);

		expect(isStale(entry)).toBe(true);
		await fetchEntry(entry);
		expect(isStale(entry)).toBe(false);
		advance(client, 100);
		expect(isStale(entry)).toBe(true);
	});
});

describe("garbage collection", () => {
	it("removes entries without readers after gcTime", async () => {
		const backend = createBackend();
		const client = testClient({ gcTime: 1000 });
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const reader = subscribeEntry(entry, () => {});
		advance(client, 5000);

		expect(client["~entries"].size).toBe(1);
		reader();
		advance(client, 999);
		expect(client["~entries"].size).toBe(1);
		advance(client, 1);
		expect(client["~entries"].size).toBe(0);
	});

	it("waits for a running request before collecting", async () => {
		const backend = createBackend();
		const client = testClient();
		const fast = (input: { readonly id: number }) => ({
			...backend.issueQuery(input),
			gcTime: 10,
		});
		const entry = entryOf(client, fast, { id: 1 });
		const done = fetchEntry(entry);
		advance(client, 10);

		expect(client["~entries"].size).toBe(1);
		backend.respondAll();
		await done;
		await flush();
		advance(client, 10);
		expect(client["~entries"].size).toBe(0);
	});

	it("collects entries whose time is up together", () => {
		const backend = createBackend();
		const client = testClient({ gcTime: 10 });
		entryOf(client, backend.issueQuery, { id: 1 });
		entryOf(client, backend.issueQuery, { id: 2 });
		advance(client, 10);

		expect(client["~entries"].size).toBe(0);
	});

	it("never collects on the server, or with an infinite gcTime", () => {
		const backend = createBackend();
		const server = testClient({ isServer: true });
		entryOf(server, backend.issueQuery, { id: 1 });
		const browser = testClient({ gcTime: Infinity });
		entryOf(browser, backend.issueQuery, { id: 1 });

		expect(timersOf(server)).toBe(0);
		expect(timersOf(browser)).toBe(0);
	});
});

describe("streams", () => {
	it("folds chunks into the data, settling waiters at the first chunk", async () => {
		const client = testClient();
		const gate = Promise.withResolvers<void>();
		const words = () =>
			queryOptions({
				async *queryFn() {
					yield "a";
					await gate.promise;
					yield "b";
				},
				queryKey: [issues, "words"],
				stream: {
					initial: "",
					reduce: (text: string, chunk: string) => text + chunk,
				},
			});
		const entry = entryOf(client, words, undefined);
		await fetchEntry(entry);

		expect(entry.state).toMatchObject({ data: "a", isFetching: true });
		gate.resolve();
		await flush();
		expect(entry.state).toMatchObject({ data: "ab", isFetching: false });
	});

	it("writes the initial data for an empty stream", async () => {
		const client = testClient();
		const empty = () =>
			queryOptions({
				// oxlint-disable-next-line require-yield -- a stream with no chunks
				async *queryFn() {},
				queryKey: [issues, "empty"],
				stream: {
					initial: 0,
					reduce: (total: number, chunk: number) => total + chunk,
				},
			});
		const entry = entryOf(client, empty, undefined);
		await fetchEntry(entry);

		expect(entry.state).toMatchObject({ data: 0, status: "success" });
	});

	it("records an error thrown mid-stream", async () => {
		const client = testClient();
		const broken = () =>
			queryOptions({
				async *queryFn() {
					yield 1;
					throw new Error("cut");
				},
				queryKey: [issues, "broken"],
				stream: {
					initial: 0,
					reduce: (total: number, chunk: number) => total + chunk,
				},
			});
		const entry = entryOf(client, broken, undefined);
		await fetchEntry(entry);
		await flush();

		expect(entry.state).toMatchObject({
			data: 1,
			isFetching: false,
			status: "error",
		});
	});

	it("ignores an error from a stream whose entry was removed", async () => {
		const client = testClient();
		const gate = Promise.withResolvers<void>();
		const failing = () =>
			queryOptions({
				async *queryFn() {
					yield 1;
					await gate.promise;
					throw new Error("late");
				},
				queryKey: [issues, "failing"],
				stream: {
					initial: 0,
					reduce: (total: number, chunk: number) => total + chunk,
				},
			});
		const entry = entryOf(client, failing, undefined);
		await fetchEntry(entry);
		remove(entry);
		gate.resolve();
		await flush();

		expect(entry.state.status).toBe("success");
	});

	it("ignores the end of a stream whose entry was removed", async () => {
		const client = testClient();
		const gate = Promise.withResolvers<void>();
		const ending = () =>
			queryOptions({
				async *queryFn() {
					yield 1;
					await gate.promise;
				},
				queryKey: [issues, "ending"],
				stream: {
					initial: 0,
					reduce: (total: number, chunk: number) => total + chunk,
				},
			});
		const entry = entryOf(client, ending, undefined);
		await fetchEntry(entry);
		remove(entry);
		gate.resolve();
		await flush();

		expect(entry.state.isFetching).toBe(true);
	});

	it("stops folding a stream whose request was replaced", async () => {
		const client = testClient();
		const gate = Promise.withResolvers<void>();
		let runs = 0;
		const counting = () =>
			queryOptions({
				async *queryFn() {
					runs += 1;
					yield runs;
					await gate.promise;
					yield 10;
					throw new Error("late");
				},
				queryKey: [issues, "counting"],
				stream: {
					initial: 0,
					reduce: (total: number, chunk: number) => total + chunk,
				},
			});
		const entry = entryOf(client, counting, undefined);
		await fetchEntry(entry);
		await fetchEntry(entry, { restart: true });
		remove(entry);
		gate.resolve();
		await flush();

		expect(entry.state.data).toBe(2);
	});
});

describe("adopted requests", () => {
	it("are dropped when their entry is removed first", async () => {
		const client = testClient();
		const resolved = entryForKey(client, [issues, "adopted"]);
		const rejectedEntry = entryForKey(client, [issues, "adopted-error"]);
		const ok = Promise.withResolvers<{ data: unknown; updatedAt: number }>();
		const bad = Promise.withResolvers<{ data: unknown; updatedAt: number }>();
		adopt(resolved, ok.promise);
		adopt(rejectedEntry, bad.promise);
		remove(resolved);
		remove(rejectedEntry);
		ok.resolve({ data: 1, updatedAt: 1 });
		bad.reject(new Error("down"));
		await flush();

		expect([resolved.state.hasData, rejectedEntry.state.status]).toEqual([
			false,
			"pending",
		]);
	});
});

describe("createQueryClient", () => {
	it("defaults to the system clock, and to the server without a window", () => {
		const client = createQueryClient();

		expect(client.clock).toBe(systemClock);
		expect(client.isServer).toBe(true);
		mount(client)();
	});
});

describe("mount", () => {
	it("starts features until stopped", () => {
		const signals: Array<AbortSignal> = [];
		const client = testClient({
			features: [(_client, signal) => signals.push(signal)],
		});
		const stop = mount(client);

		expect(signals[0]?.aborted).toBe(false);
		stop();
		expect(signals[0]?.aborted).toBe(true);
	});
});
