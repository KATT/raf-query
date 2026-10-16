import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, Fiber, Stream } from "effect";

import { Query, QueryObserver, type Thenable } from "./index.ts";
import { createBackend, flush, makeCacheUnsafe } from "./test-utils.ts";

async function setup() {
	const backend = createBackend();
	const qc = makeCacheUnsafe({ isServer: false });
	Effect.runSync(qc.prefetch(backend.issueQuery, { id: 1 }));
	backend.respondAll();
	await flush();
	const query = qc.getQueryUnsafe(backend.issueQuery, { id: 1 });
	return { backend, qc, query };
}

function fakeTimers(): Disposable {
	vi.useFakeTimers();
	return {
		[Symbol.dispose]() {
			vi.useRealTimers();
		},
	};
}

describe("QueryObserver", () => {
	it("notifies on every result change while nothing is tracked", async () => {
		const test = await setup();
		const observer = QueryObserver.makeUnsafe(test.query);
		const listener = vi.fn();
		QueryObserver.subscribeUnsafe(observer, listener);

		Effect.runFork(Query.refetch(test.query));
		await flush();
		expect(listener).toHaveBeenCalledOnce();
		expect(QueryObserver.getUnsafe(observer).isFetching).toBe(true);
	});

	it("notifies only for tracked properties once one is read", async () => {
		const test = await setup();
		const observer = QueryObserver.makeUnsafe(test.query);
		const listener = vi.fn();
		QueryObserver.subscribeUnsafe(observer, listener);
		const result = QueryObserver.trackResult(
			observer,
			QueryObserver.getUnsafe(observer),
		);
		void result.promise;

		Effect.runFork(Query.refetch(test.query));
		await flush();
		expect(listener).not.toHaveBeenCalled();

		test.backend.issues.set(1, { id: 1, title: "Renamed" });
		test.backend.respondAll();
		await flush();
		expect(listener).toHaveBeenCalledOnce();

		void QueryObserver.trackResult(observer, QueryObserver.getUnsafe(observer))
			.isFetching;
		Effect.runFork(Query.refetch(test.query));
		await flush();
		expect(listener).toHaveBeenCalledTimes(2);
	});

	describe("a first load settling its promise in place", () => {
		async function pendingObserver(id: number) {
			const backend = createBackend();
			const qc = makeCacheUnsafe({ isServer: false });
			Effect.runSync(qc.prefetch(backend.issueQuery, { id }));
			await flush();
			const query = qc.getQueryUnsafe(backend.issueQuery, { id });
			const observer = QueryObserver.makeUnsafe(query);
			const pending = QueryObserver.getUnsafe(observer).promise;
			expect(pending.status).toBe("pending");
			return { backend, observer, pending };
		}

		function readStatus(observer: QueryObserver.QueryObserver) {
			QueryObserver.trackProp(observer, "promise");
			return QueryObserver.trackThenable(
				observer,
				QueryObserver.getUnsafe(observer).promise,
			).status;
		}

		it("notifies a listener that read its status when it fulfills", async () => {
			const test = await pendingObserver(1);
			const listener = vi.fn();
			QueryObserver.subscribeUnsafe(test.observer, listener);
			expect(readStatus(test.observer)).toBe("pending");

			test.backend.respondAll();
			await flush();
			expect(listener).toHaveBeenCalledOnce();
			const promise = QueryObserver.getUnsafe(test.observer).promise;
			expect(promise).toBe(test.pending);
			expect(promise).toMatchObject({
				status: "fulfilled",
				value: { id: 1, title: "First" },
			});
		});

		it("notifies a listener that read its status when it rejects", async () => {
			const test = await pendingObserver(3);
			const listener = vi.fn();
			QueryObserver.subscribeUnsafe(test.observer, listener);
			readStatus(test.observer);

			test.backend.respondAll();
			await flush();
			expect(listener).toHaveBeenCalledOnce();
			const promise = QueryObserver.getUnsafe(test.observer).promise;
			expect(promise).toBe(test.pending);
			expect(promise.status).toBe("rejected");
		});

		it("doesn't notify a listener that tracks the promise but never read its status", async () => {
			const test = await pendingObserver(1);
			const listener = vi.fn();
			QueryObserver.subscribeUnsafe(test.observer, listener);
			QueryObserver.trackProp(test.observer, "promise");
			const tracked = QueryObserver.trackThenable(test.observer, test.pending);

			test.backend.respondAll();
			await flush();
			expect(listener).not.toHaveBeenCalled();
			expect(await tracked).toEqual({ id: 1, title: "First" });
			expect(QueryObserver.getUnsafe(test.observer).promise.status).toBe(
				"fulfilled",
			);
		});

		it("wraps each promise once for every observer, and the wrapper settles with it", async () => {
			const test = await pendingObserver(1);
			const tracked = QueryObserver.trackThenable(test.observer, test.pending);
			const other = QueryObserver.makeUnsafe(test.observer.query);
			expect(QueryObserver.trackThenable(other, test.pending)).toBe(tracked);
			expect(tracked).toBeInstanceOf(Promise);

			test.backend.respondAll();
			expect(await tracked).toEqual({ id: 1, title: "First" });
			expect(tracked.status).toBe("fulfilled");
		});
	});

	it("keeps the previous query's data with whilePending: previous", async () => {
		const test = await setup();
		const options = { whilePending: "previous" } as const;
		const observer = QueryObserver.makeUnsafe(test.query, options);
		QueryObserver.subscribeUnsafe(observer, () => {});
		const second = test.qc.getQueryUnsafe(test.backend.issueQuery, {
			id: 2,
		});
		Query.readUnsafe(second);

		QueryObserver.setOptionsUnsafe(observer, second, options);
		expect(QueryObserver.getUnsafe(observer)).toMatchObject({
			input: { id: 1 },
			isPending: true,
			isPrevious: true,
			key: ["issue", 1],
			promise: Query.getUnsafe(test.query).promise,
		});
		expect(Query.observerCountUnsafe(test.query)).toBe(0);
		expect(Query.observerCountUnsafe(second)).toBe(1);

		test.backend.respondAll();
		await flush();
		expect(QueryObserver.getUnsafe(observer)).toMatchObject({
			input: { id: 2 },
			isPrevious: false,
			promise: Query.getUnsafe(second).promise,
		});
	});

	describe("select", () => {
		async function setTitle(
			test: Awaited<ReturnType<typeof setup>>,
			title: string,
		) {
			Effect.runSync(
				test.qc.setData(test.backend.issueQuery, { id: 1 }, { id: 1, title }),
			);
			await flush();
		}

		/** The value of a selection's promise, which the observer types as the query's data. */
		function selectedValue<T>(promise: Thenable<unknown>): T {
			if (promise.status !== "fulfilled") {
				throw new Error(`Selection is ${promise.status}`);
			}
			// SAFETY: with `select`, the observer's promise holds what it
			// returns; the observer's types don't follow `select`.
			return promise.value as T;
		}

		it("settles the promise with what it returns", async () => {
			const test = await setup();
			const observer = QueryObserver.makeUnsafe(test.query, {
				select: (issue: { title: string }) => issue.title.toUpperCase(),
			});
			expect(QueryObserver.getUnsafe(observer).promise).toMatchObject({
				status: "fulfilled",
				value: "FIRST",
			});
		});

		it("keeps the promise, and doesn't notify, when the selection is deeply equal", async () => {
			const test = await setup();
			const select = vi.fn((issue: { id: number; title: string }) => ({
				id: issue.id,
			}));
			const observer = QueryObserver.makeUnsafe(test.query, { select });
			const listener = vi.fn();
			QueryObserver.subscribeUnsafe(observer, listener);
			QueryObserver.trackProp(observer, "promise");
			const before = QueryObserver.getUnsafe(observer).promise;

			await setTitle(test, "Renamed");
			expect(select).toHaveBeenCalledTimes(2);
			expect(Query.getUnsafe(test.query).promise).toMatchObject({
				value: { title: "Renamed" },
			});
			expect(QueryObserver.getUnsafe(observer).promise).toBe(before);
			expect(listener).not.toHaveBeenCalled();
		});

		it("notifies with a new promise when the selection changes", async () => {
			const test = await setup();
			const observer = QueryObserver.makeUnsafe(test.query, {
				select: (issue: { title: string }) => issue.title,
			});
			const listener = vi.fn();
			QueryObserver.subscribeUnsafe(observer, listener);
			QueryObserver.trackProp(observer, "promise");

			await setTitle(test, "Renamed");
			expect(listener).toHaveBeenCalledOnce();
			expect(QueryObserver.getUnsafe(observer).promise).toMatchObject({
				status: "fulfilled",
				value: "Renamed",
			});
		});

		it("shares unchanged parts of the selection with the last one", async () => {
			const test = await setup();
			const select = (issue: { id: number; title: string }) => ({
				ids: [issue.id],
				title: issue.title,
			});
			const observer = QueryObserver.makeUnsafe(test.query, { select });
			QueryObserver.subscribeUnsafe(observer, () => {});
			const before = selectedValue<ReturnType<typeof select>>(
				QueryObserver.getUnsafe(observer).promise,
			);

			await setTitle(test, "Renamed");
			const after = selectedValue<ReturnType<typeof select>>(
				QueryObserver.getUnsafe(observer).promise,
			);
			expect(after).not.toBe(before);
			expect(after).toMatchObject({ title: "Renamed" });
			expect(after).toHaveProperty("ids", before?.ids);
		});

		it("runs a new function on the same data, keeping the promise for an equal result", async () => {
			const test = await setup();
			const observer = QueryObserver.makeUnsafe(test.query, {
				select: (issue: { title: string }) => [issue.title],
			});
			const first = QueryObserver.getUnsafe(observer).promise;
			const inline = vi.fn((issue: { title: string }) => [issue.title]);

			expect(
				QueryObserver.getOptimisticResultUnsafe(observer, test.query, {
					select: inline,
				}).promise,
			).toBe(first);
			expect(inline).toHaveBeenCalledOnce();
			expect(
				QueryObserver.getOptimisticResultUnsafe(observer, test.query, {
					select: (issue: { title: string }) => [issue.title, "!"],
				}).promise,
			).toMatchObject({ value: ["First", "!"] });
		});

		it("doesn't run again for the same data and function", async () => {
			const test = await setup();
			const select = vi.fn((issue: { title: string }) => issue.title);
			const observer = QueryObserver.makeUnsafe(test.query, { select });

			QueryObserver.getOptimisticResultUnsafe(observer, test.query, {
				select,
			});
			QueryObserver.subscribeUnsafe(observer, () => {});
			expect(select).toHaveBeenCalledOnce();
		});

		it("settles the selection of a pending first load in place", async () => {
			const backend = createBackend();
			const qc = makeCacheUnsafe({ isServer: false });
			Effect.runSync(qc.prefetch(backend.issueQuery, { id: 1 }));
			const query = qc.getQueryUnsafe(backend.issueQuery, { id: 1 });
			const observer = QueryObserver.makeUnsafe(query, {
				select: (issue: { title: string }) => issue.title,
			});
			const listener = vi.fn();
			QueryObserver.subscribeUnsafe(observer, listener);
			QueryObserver.trackProp(observer, "promise");
			const promise = QueryObserver.getUnsafe(observer).promise;
			expect(QueryObserver.trackThenable(observer, promise).status).toBe(
				"pending",
			);

			backend.respondAll();
			await flush();
			expect(listener).toHaveBeenCalledOnce();
			expect(QueryObserver.getUnsafe(observer).promise).toBe(promise);
			expect(promise).toMatchObject({ status: "fulfilled", value: "First" });
		});

		it("settles a pending selection with no listener when its source does", async () => {
			const backend = createBackend();
			const qc = makeCacheUnsafe({ isServer: false });
			Effect.runSync(qc.prefetch(backend.issueQuery, { id: 1 }));
			const query = qc.getQueryUnsafe(backend.issueQuery, { id: 1 });
			const observer = QueryObserver.makeUnsafe(query, {
				select: (issue: { title: string }) => issue.title,
			});

			backend.respondAll();
			expect(await QueryObserver.getUnsafe(observer).promise).toBe("First");
		});

		it("rejects with a failed first load's error", async () => {
			const backend = createBackend();
			const qc = makeCacheUnsafe({ isServer: false });
			Effect.runSync(qc.prefetch(backend.issueQuery, { id: 3 }));
			const query = qc.getQueryUnsafe(backend.issueQuery, { id: 3 });
			const observer = QueryObserver.makeUnsafe(query, {
				select: (issue: { title: string }) => issue.title,
			});
			const promise = QueryObserver.getUnsafe(observer).promise;

			backend.respondAll();
			await expect(promise).rejects.toThrow("No issue 3");
		});

		it("rejects with what it throws", async () => {
			const test = await setup();
			const observer = QueryObserver.makeUnsafe(test.query, {
				select: () => {
					throw new Error("bad select");
				},
			});
			const promise = QueryObserver.getUnsafe(observer).promise;
			expect(promise.status).toBe("rejected");
			await expect(promise).rejects.toThrow("bad select");
		});

		it("selects the previous query's data with whilePending: previous", async () => {
			const test = await setup();
			const options = {
				select: (issue: { id: number }) => issue.id > 0,
				whilePending: "previous",
			} as const;
			const observer = QueryObserver.makeUnsafe(test.query, options);
			QueryObserver.subscribeUnsafe(observer, () => {});
			const before = QueryObserver.getUnsafe(observer).promise;
			const second = test.qc.getQueryUnsafe(test.backend.issueQuery, {
				id: 2,
			});
			Query.readUnsafe(second);

			QueryObserver.setOptionsUnsafe(observer, second, options);
			expect(QueryObserver.getUnsafe(observer)).toMatchObject({
				isPrevious: true,
				promise: before,
			});

			test.backend.respondAll();
			await flush();
			expect(QueryObserver.getUnsafe(observer)).toMatchObject({
				input: { id: 2 },
				isPrevious: false,
				promise: before,
			});
		});
	});

	it("refetches on refetchInterval while subscribed", async () => {
		const test = await setup();
		using _timers = fakeTimers();
		const observer = QueryObserver.makeUnsafe(test.query, {
			refetchInterval: 1000,
		});
		const unsubscribe = QueryObserver.subscribeUnsafe(observer, () => {});

		vi.advanceTimersByTime(1000);
		expect(test.backend.requests).toHaveLength(1);
		test.backend.respondAll();

		unsubscribe();
		expect(Query.observerCountUnsafe(test.query)).toBe(0);
		vi.advanceTimersByTime(5000);
		expect(test.backend.requests).toHaveLength(0);
	});

	it("restarts polling when refetchInterval changes", async () => {
		const test = await setup();
		using _timers = fakeTimers();
		const observer = QueryObserver.makeUnsafe(test.query, {
			refetchInterval: 1000,
		});
		QueryObserver.subscribeUnsafe(observer, () => {});

		QueryObserver.setOptionsUnsafe(observer, test.query, {
			refetchInterval: 3000,
		});
		vi.advanceTimersByTime(2000);
		expect(test.backend.requests).toHaveLength(0);
		vi.advanceTimersByTime(1000);
		expect(test.backend.requests).toHaveLength(1);
		test.backend.respondAll();

		QueryObserver.setOptionsUnsafe(observer, test.query, {});
		vi.advanceTimersByTime(10_000);
		expect(test.backend.requests).toHaveLength(0);
	});

	it("stops polling when its query leaves the cache", async () => {
		const test = await setup();
		using _timers = fakeTimers();
		const observer = QueryObserver.makeUnsafe(test.query, {
			refetchInterval: 1000,
		});
		QueryObserver.subscribeUnsafe(observer, () => {});

		Effect.runSync(test.qc.remove(test.backend.issueQuery, { id: 1 }));
		expect(Query.observerCountUnsafe(test.query)).toBe(0);
		vi.advanceTimersByTime(5000);
		expect(test.backend.requests).toHaveLength(0);
	});

	it.effect("changes streams the current result, then every change", () =>
		Effect.gen(function* () {
			const test = yield* Effect.promise(setup);
			const observer = yield* QueryObserver.make(test.query);
			const fiber = yield* Effect.forkChild(
				QueryObserver.changes(observer).pipe(
					Stream.map((result) => result.isFetching),
					Stream.take(3),
					Stream.runCollect,
				),
				{ startImmediately: true },
			);
			expect(Query.observerCountUnsafe(test.query)).toBe(1);

			yield* Effect.forkChild(Query.refetch(test.query), {
				startImmediately: true,
			});
			yield* Effect.promise(flush);
			test.backend.respondAll();

			expect(yield* Fiber.join(fiber)).toEqual([false, true, false]);
			expect(Query.observerCountUnsafe(test.query)).toBe(0);
		}),
	);
});
