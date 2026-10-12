import {
	describe,
	expect,
	expectTypeOf,
	it,
	onTestFinished,
	vi,
} from "@effect/vitest";
import { Effect, Schedule } from "effect";

import { effectQueryOptions, retrySchedule } from "./effect.ts";
import { CancelledError, QueryClient, queryOptions } from "./index.ts";
import { createBackend, flush } from "./test-utils.ts";

function useFakeTimers(options?: Parameters<typeof vi.useFakeTimers>[0]) {
	vi.useFakeTimers(options);
	onTestFinished(() => {
		vi.useRealTimers();
	});
}

describe("prefetch", () => {
	it("returns a handle and starts one request per key", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });

		const handle = qc.prefetch(backend.issueQuery, { id: 1 });
		qc.prefetch(backend.issueQuery, { id: 1 });

		expect(handle).toEqual({ input: { id: 1 }, key: ["issue", 1] });
		expect(backend.requests).toHaveLength(1);
		expect(qc.getQuery(backend.issueQuery, { id: 1 }).getState()).toMatchObject(
			{ isFetching: true, status: "pending" },
		);
	});

	it("reuses fresh data and refetches stale data in the background", async () => {
		const backend = createBackend();
		const qc = new QueryClient({
			defaults: { staleTime: 1000 },
			isServer: false,
		});
		useFakeTimers({ toFake: ["Date"] });

		qc.prefetch(backend.issueQuery, { id: 1 });
		backend.respondAll();
		await flush();
		qc.prefetch(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(0);

		vi.setSystemTime(Date.now() + 1000);
		qc.prefetch(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(1);
		expect(qc.getData(backend.issueQuery, { id: 1 })).toEqual({
			id: 1,
			title: "First",
		});
	});

	it("never throws, and reports failures to onError", async () => {
		const backend = createBackend();
		const onError = vi.fn();
		const qc = new QueryClient({ isServer: false, onError });

		qc.prefetch(backend.issueQuery, { id: 404 });
		backend.respondAll();
		await flush();

		expect(onError).toHaveBeenCalledOnce();
		const query = qc.getQuery(backend.issueQuery, { id: 404 });
		expect(query.getState().status).toBe("error");
		await expect(query.getState().promise).rejects.toThrow("No issue 404");
	});
});

describe("ensure and fetch", () => {
	it("wait on a cache miss", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });

		const handle = qc.ensure(backend.issueQuery, { id: 1 });
		const data = qc.fetch(backend.issueQuery, { id: 1 });
		backend.respondAll();

		expect(await handle).toEqual({
			ensured: true,
			input: { id: 1 },
			key: ["issue", 1],
		});
		expect(await data).toEqual({ id: 1, title: "First" });
		expect(backend.requests).toHaveLength(0);
	});

	it("resolve immediately with stale data and revalidate", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "Cached" });

		const issue = await qc.fetch(backend.issueQuery, { id: 1 });

		expect(issue.title).toBe("Cached");
		expect(backend.requests).toHaveLength(1);
	});

	it("reject when the request fails", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });

		const handle = qc.ensure(backend.issueQuery, { id: 404 });
		backend.respondAll();

		await expect(handle).rejects.toThrow("No issue 404");
	});

	it("accept factories without input", async () => {
		const qc = new QueryClient({ isServer: false });
		function countQuery() {
			return queryOptions({ queryFn: () => 42, queryKey: ["count"] });
		}

		expect(await qc.fetch(countQuery)).toBe(42);
		expect(qc.prefetch(countQuery)).toEqual({
			input: undefined,
			key: ["count"],
		});
	});
});

describe("undefined data", () => {
	function maybeQuery() {
		return queryOptions({
			queryFn: (): Promise<number | undefined> => Promise.resolve(undefined),
			queryKey: ["maybe"],
			staleTime: Infinity,
		});
	}

	it("is data like any other value", async () => {
		const queryFn = vi.fn(() => Promise.resolve(undefined));
		const qc = new QueryClient({ isServer: false });
		function noneQuery() {
			return queryOptions({ queryFn, queryKey: ["none"], staleTime: Infinity });
		}

		await expect(qc.fetch(noneQuery)).resolves.toBeUndefined();
		await expect(qc.ensure(noneQuery)).resolves.toMatchObject({
			ensured: true,
		});
		await expect(qc.getQuery(noneQuery).read()).resolves.toBeUndefined();
		expect(qc.getQuery(noneQuery).getState()).toMatchObject({
			data: undefined,
			hasData: true,
			status: "success",
		});
		expect(queryFn).toHaveBeenCalledOnce();
	});

	it("can be written with setData, and hasData tells it from no data", async () => {
		const qc = new QueryClient({ isServer: false });
		expect(qc.getData(maybeQuery)).toBeUndefined();
		expect(qc.getQuery(maybeQuery).getState().hasData).toBe(false);

		qc.setData(maybeQuery, undefined, undefined);

		expect(qc.getData(maybeQuery)).toBeUndefined();
		expect(qc.getQuery(maybeQuery).getState().hasData).toBe(true);
		await expect(qc.fetch(maybeQuery)).resolves.toBeUndefined();
	});

	it("types data from the queryFn, including undefined", () => {
		const fetchMaybe = (qc: QueryClient) => qc.fetch(maybeQuery);
		expectTypeOf(fetchMaybe).returns.resolves.toEqualTypeOf<
			number | undefined
		>();
	});
});

describe("on the server", () => {
	it("verbs reuse cached data instead of revalidating it", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: true });

		const data = qc.fetch(backend.issueQuery, { id: 1 });
		backend.respondAll();
		expect(await data).toEqual({ id: 1, title: "First" });
		expect(qc.getQuery(backend.issueQuery, { id: 1 }).isStaleNow()).toBe(true);

		const handle = await qc.ensure(backend.issueQuery, { id: 1 });
		qc.prefetch(backend.issueQuery, { id: 1 });
		expect(await qc.fetch(backend.issueQuery, { id: 1 })).toEqual({
			id: 1,
			title: "First",
		});

		expect(handle.ensured).toBe(true);
		expect(backend.requests).toHaveLength(0);
	});

	it("invalidate refetches read entries", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: true });
		const data = qc.fetch(backend.issueQuery, { id: 1 });
		backend.respondAll();
		await data;
		qc.getQuery(backend.issueQuery, { id: 1 }).subscribe(() => {});

		const invalidated = qc.invalidate(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(1);
		backend.issues.set(1, { id: 1, title: "Edited" });
		backend.respondAll();
		await invalidated;

		expect(qc.getData(backend.issueQuery, { id: 1 })?.title).toBe("Edited");
	});

	it("verbs refetch unread entries invalidate marked", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: true });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });

		await qc.invalidate(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(0);

		qc.prefetch(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(1);
	});
});

describe("read", () => {
	it("returns a thenable React can read synchronously once data exists", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });

		const first = query.read();
		expect(first).toMatchObject({ status: "pending" });
		backend.respondAll();
		await first;

		expect(first).toMatchObject({
			status: "fulfilled",
			value: { id: 1, title: "First" },
		});
		expect(query.read()).toBe(first);
	});

	it("creates a new fulfilled promise per data version", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		const before = query.read();

		qc.setData(backend.issueQuery, { id: 1 }, (issue) => ({
			id: 1,
			title: `${issue?.title}B`,
		}));

		expect(query.read()).not.toBe(before);
		expect(query.read()).toMatchObject({
			status: "fulfilled",
			value: { title: "AB" },
		});
	});

	it("retries a failed first load once its error has been shown", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		backend.issues.delete(1);
		const query = qc.getQuery(backend.issueQuery, { id: 1 });

		const failed = query.read();
		backend.respondAll();
		await expect(failed).rejects.toThrow("No issue 1");

		// Same task: React re-rendering the throwing component.
		expect(query.read()).toBe(failed);
		expect(backend.requests).toHaveLength(0);

		// A later task: the error boundary was reset.
		await flush();
		backend.issues.set(1, { id: 1, title: "Back" });
		const retried = query.read();
		expect(retried).not.toBe(failed);
		backend.respondAll();
		expect(await retried).toEqual({ id: 1, title: "Back" });
	});
});

describe("structural sharing", () => {
	function listQuery(options: { structuralSharing?: boolean } = {}) {
		return () =>
			queryOptions({
				queryFn: () => [
					{ id: 1, tags: ["a"], title: "First" },
					{ id: 2, tags: ["b"], title: "Second" },
				],
				queryKey: ["list"],
				...options,
			});
	}

	it("keeps the data and promise when a refetch returns equal data", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(listQuery());
		await query.fetch();
		const before = query.getState();

		await query.refetch();

		const after = query.getState();
		expect(after.data).toBe(before.data);
		expect(after.promise).toBe(before.promise);
		expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
	});

	it("reuses unchanged parts of new data", async () => {
		const qc = new QueryClient({ isServer: false });
		const factory = listQuery();
		const data = await qc.fetch(factory);
		const promise = qc.getQuery(factory).getState().promise;

		qc.setData(factory, undefined, [
			{ id: 1, tags: ["a"], title: "First" },
			{ id: 2, tags: ["b"], title: "Renamed" },
		]);

		const next = qc.getData(factory);
		expect(next).not.toBe(data);
		expect(next?.[0]).toBe(data[0]);
		expect(next?.[1]).not.toBe(data[1]);
		expect(next?.[1]?.tags).toBe(data[1]?.tags);
		expect(qc.getQuery(factory).getState().promise).not.toBe(promise);
	});

	it("is skipped with structuralSharing: false", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(listQuery({ structuralSharing: false }));
		await query.fetch();
		const before = query.getState();

		await query.refetch();

		expect(query.getState().data).not.toBe(before.data);
		expect(query.getState().promise).not.toBe(before.promise);
	});
});

describe("subscriptions", () => {
	it("notify once per microtask batch", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		const listener = vi.fn();
		query.subscribe(listener);

		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "B" });
		expect(listener).not.toHaveBeenCalled();

		await Promise.resolve();
		expect(listener).toHaveBeenCalledOnce();
	});

	it("emit cache events", () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const events: Array<string> = [];
		qc.subscribe((event) => events.push(`${event.type} ${event.query.hash}`));

		qc.prefetch(backend.issueQuery, { id: 1 });
		qc.clear();

		expect(events).toEqual([
			'added ["issue",1]',
			'updated ["issue",1]',
			'removed ["issue",1]',
		]);
	});

	it("mark a read entry stale when its staleTime passes", async () => {
		useFakeTimers();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(() =>
			queryOptions({ queryFn: () => 1, queryKey: ["n"], staleTime: 100 }),
		);
		query.subscribe(() => {});
		await query.fetch();
		expect(query.getState().isStale).toBe(false);

		await vi.advanceTimersByTimeAsync(101);

		expect(query.getState().isStale).toBe(true);
	});
});

describe("invalidate", () => {
	it("refetches read entries and resolves when they settle", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		query.subscribe(() => {});
		query.read();
		backend.respondAll();
		await flush();

		let settled = false;
		const invalidated = qc
			.invalidate(backend.issueQuery, { id: 1 })
			.then(() => {
				settled = true;
			});
		await flush();
		expect(settled).toBe(false);
		expect(backend.requests).toHaveLength(1);

		backend.issues.set(1, { id: 1, title: "Edited" });
		backend.respondAll();
		await invalidated;
		expect(query.getState().data?.title).toBe("Edited");
		expect(query.getState().isInvalidated).toBe(false);
	});

	it("only marks unread entries stale", async () => {
		const backend = createBackend();
		const qc = new QueryClient({
			defaults: { staleTime: Infinity },
			isServer: false,
		});
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });

		await qc.invalidate(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(0);

		qc.prefetch(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(1);
	});

	it("matches entries by key prefix, including partial object segments", async () => {
		const qc = new QueryClient({ isServer: false });
		function listQuery(input: { page: number; status: string }) {
			return queryOptions({
				queryFn: () => [],
				queryKey: ["issues", { page: input.page, status: input.status }],
				staleTime: Infinity,
			});
		}
		qc.setData(listQuery, { page: 1, status: "open" }, []);
		qc.setData(listQuery, { page: 2, status: "open" }, []);
		qc.setData(listQuery, { page: 1, status: "closed" }, []);

		await qc.invalidate({ queryKey: ["issues", { status: "open" }] });

		const invalidated = qc
			.getAll()
			.filter((query) => query.getState().isInvalidated)
			.map((query) => query.hash);
		expect(invalidated).toEqual([
			'["issues",{"page":1,"status":"open"}]',
			'["issues",{"page":2,"status":"open"}]',
		]);
	});

	it("restarts an in-flight request and aborts the old one", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		query.subscribe(() => {});
		const first = query.read();
		const [oldRequest] = backend.requests;

		const invalidated = qc.invalidate(backend.issueQuery, { id: 1 });

		expect(oldRequest?.signal.aborted).toBe(true);
		backend.respondAll();
		await invalidated;
		expect(await first).toEqual({ id: 1, title: "First" });
	});
});

describe("observers", () => {
	it("are counted, and changes emit an observers event", () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		const events: Array<string> = [];
		qc.subscribe((event) => events.push(event.type));

		const first = query.subscribe(() => {});
		const second = query.subscribe(() => {});
		expect(query.observerCount).toBe(2);
		first();
		first();
		second();

		expect(query.observerCount).toBe(0);
		expect(events).toEqual([
			"observers",
			"observers",
			"observers",
			"observers",
		]);
	});
});

describe("reset", () => {
	it("drops data and refetches read entries behind a pending promise", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		query.subscribe(() => {});
		query.read();
		backend.respondAll();
		await flush();

		const reset = qc.reset(backend.issueQuery, { id: 1 });
		const state = query.getState();
		expect(state).toMatchObject({
			data: undefined,
			hasData: false,
			isFetching: true,
			status: "pending",
		});

		backend.issues.set(1, { id: 1, title: "Again" });
		backend.respondAll();
		await reset;
		expect(await state.promise).toEqual({ id: 1, title: "Again" });
		expect(query.getState().status).toBe("success");
	});

	it("leaves unread entries empty until they are read", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });

		await qc.reset({ queryKey: ["issue"] });

		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		expect(query.getState().hasData).toBe(false);
		expect(backend.requests).toHaveLength(0);
		query.read();
		expect(backend.requests).toHaveLength(1);
	});

	it("restarts an in-flight request so its old response can't restore data", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
		qc.getQuery(backend.issueQuery, { id: 1 }).refetch();
		const [oldRequest] = backend.requests;

		const reset = qc.reset(backend.issueQuery, { id: 1 });

		expect(oldRequest?.signal.aborted).toBe(true);
		backend.respondAll();
		await reset;
		expect(qc.getData(backend.issueQuery, { id: 1 })).toEqual({
			id: 1,
			title: "First",
		});
	});
});

describe("remove", () => {
	it("drops matching entries and aborts their requests", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const events: Array<string> = [];
		qc.subscribe((event) => events.push(`${event.type} ${event.query.hash}`));
		const pending = qc.fetch(backend.issueQuery, { id: 1 });
		qc.setData(backend.issueQuery, { id: 2 }, { id: 2, title: "B" });

		qc.remove(backend.issueQuery, { id: 1 });

		await expect(pending).rejects.toBeInstanceOf(CancelledError);
		expect(backend.requests[0]?.signal.aborted).toBe(true);
		expect(qc.getAll().map((query) => query.hash)).toEqual(['["issue",2]']);
		expect(events).toContain('removed ["issue",1]');

		qc.remove({ queryKey: ["issue"] });
		expect(qc.getAll()).toHaveLength(0);
	});
});

describe("retry", () => {
	it("retries the configured number of times", async () => {
		const queryFn = vi.fn(() => Promise.reject(new Error("down")));
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(() =>
			queryOptions({ queryFn, queryKey: ["flaky"], retry: 2, retryDelay: 0 }),
		);

		await expect(query.fetch()).rejects.toThrow("down");

		expect(queryFn).toHaveBeenCalledTimes(3);
		expect(query.getState().failureCount).toBe(3);
	});

	it("backs off exponentially by default", async () => {
		useFakeTimers();
		let calls = 0;
		const qc = new QueryClient({ isServer: false });
		const result = qc.fetch(() =>
			queryOptions({
				queryFn: () => {
					calls++;
					return calls < 3 ? Promise.reject(new Error("down")) : "ok";
				},
				queryKey: ["backoff"],
			}),
		);

		await vi.advanceTimersByTimeAsync(999);
		expect(calls).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(calls).toBe(2);
		await vi.advanceTimersByTimeAsync(2000);
		expect(await result).toBe("ok");
	});

	it("accepts a predicate and an Effect schedule", async () => {
		const qc = new QueryClient({ isServer: false });
		const byPredicate = vi.fn(() => Promise.reject(new Error("down")));
		const bySchedule = vi.fn(() => Promise.reject(new Error("down")));
		const byDefault = vi.fn(() => Promise.reject(new Error("down")));
		const withDefaults = new QueryClient({
			defaults: { retry: retrySchedule(Schedule.recurs(2)) },
			isServer: false,
		});

		await expect(
			qc.fetch(() =>
				queryOptions({
					queryFn: byPredicate,
					queryKey: ["predicate"],
					retry: (failureCount) => failureCount < 2,
					retryDelay: 0,
				}),
			),
		).rejects.toThrow("down");
		await expect(
			qc.fetch(() =>
				effectQueryOptions({
					queryFn: bySchedule,
					queryKey: ["schedule"],
					retry: Schedule.recurs(4),
				}),
			),
		).rejects.toThrow("down");
		await expect(
			withDefaults.fetch(() =>
				queryOptions({ queryFn: byDefault, queryKey: ["default"] }),
			),
		).rejects.toThrow("down");
		// Each request steps its own copy of the schedule.
		await expect(
			withDefaults.fetch(() =>
				queryOptions({ queryFn: byDefault, queryKey: ["default", 2] }),
			),
		).rejects.toThrow("down");

		expect(byPredicate).toHaveBeenCalledTimes(2);
		expect(bySchedule).toHaveBeenCalledTimes(5);
		expect(byDefault).toHaveBeenCalledTimes(6);
	});

	describe("offline", () => {
		function goOffline() {
			const target = new EventTarget();
			const network = { onLine: false };
			vi.stubGlobal("window", target);
			vi.stubGlobal("navigator", network);
			return {
				goOnline() {
					network.onLine = true;
					target.dispatchEvent(new Event("online"));
				},
				target,
			};
		}

		function failingOnce() {
			let calls = 0;
			return vi.fn(() => {
				calls++;
				return calls === 1 ? Promise.reject(new Error("down")) : "ok";
			});
		}

		it("waits for the browser to come back online before retrying", async () => {
			useFakeTimers();
			const browser = goOffline();
			const queryFn = failingOnce();
			const qc = new QueryClient({ isServer: false });
			const query = qc.getQuery(() =>
				queryOptions({ queryFn, queryKey: ["offline"] }),
			);
			const result = query.fetch();

			await vi.advanceTimersByTimeAsync(60_000);
			expect(queryFn).toHaveBeenCalledOnce();
			expect(query.getState()).toMatchObject({
				failureCount: 1,
				isFetching: true,
				status: "pending",
			});

			browser.goOnline();
			await vi.advanceTimersByTimeAsync(0);

			expect(await result).toBe("ok");
			expect(queryFn).toHaveBeenCalledTimes(2);
		});

		it("still waits for the retry delay", async () => {
			useFakeTimers();
			const browser = goOffline();
			const queryFn = failingOnce();
			const qc = new QueryClient({ isServer: false });
			const result = qc.fetch(() =>
				queryOptions({ queryFn, queryKey: ["offline"], retryDelay: 1000 }),
			);

			await vi.advanceTimersByTimeAsync(500);
			browser.goOnline();
			await vi.advanceTimersByTimeAsync(499);
			expect(queryFn).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(1);

			expect(await result).toBe("ok");
		});

		it("pauses Schedule retries too", async () => {
			useFakeTimers();
			const browser = goOffline();
			const queryFn = failingOnce();
			const qc = new QueryClient({ isServer: false });
			const result = qc.fetch(() =>
				effectQueryOptions({
					queryFn,
					queryKey: ["offline"],
					retry: Schedule.recurs(3),
				}),
			);

			await vi.advanceTimersByTimeAsync(60_000);
			expect(queryFn).toHaveBeenCalledOnce();

			browser.goOnline();

			expect(await result).toBe("ok");
		});

		it("stops waiting when the query is removed", async () => {
			useFakeTimers();
			const browser = goOffline();
			const removeListener = vi.spyOn(browser.target, "removeEventListener");
			const queryFn = vi.fn(() => Promise.reject(new Error("down")));
			const qc = new QueryClient({ isServer: false });
			const factory = () => queryOptions({ queryFn, queryKey: ["offline"] });
			const result = qc.fetch(factory);
			await vi.advanceTimersByTimeAsync(60_000);

			qc.remove(factory);

			await expect(result).rejects.toBeInstanceOf(CancelledError);
			expect(removeListener).toHaveBeenCalledWith(
				"online",
				expect.any(Function),
			);
			browser.goOnline();
			await vi.advanceTimersByTimeAsync(60_000);
			expect(queryFn).toHaveBeenCalledOnce();
		});

		it("doesn't delay retries while online", async () => {
			const browser = goOffline();
			browser.goOnline();
			const queryFn = vi.fn(() => Promise.reject(new Error("down")));
			const qc = new QueryClient({ isServer: false });

			await expect(
				qc.fetch(() =>
					queryOptions({ queryFn, queryKey: ["online"], retryDelay: 0 }),
				),
			).rejects.toThrow("down");
			expect(queryFn).toHaveBeenCalledTimes(4);
		});

		it("doesn't wait on the server", async () => {
			goOffline();
			const queryFn = vi.fn(() => Promise.reject(new Error("down")));
			const qc = new QueryClient({ isServer: true });

			await expect(
				qc.fetch(() =>
					queryOptions({
						queryFn,
						queryKey: ["server"],
						retry: 1,
						retryDelay: 0,
					}),
				),
			).rejects.toThrow("down");
			expect(queryFn).toHaveBeenCalledTimes(2);
		});
	});

	it("is off on the server", async () => {
		const queryFn = vi.fn(() => Promise.reject(new Error("down")));
		const qc = new QueryClient({ isServer: true });

		await expect(
			qc.fetch(() => queryOptions({ queryFn, queryKey: ["server"] })),
		).rejects.toThrow("down");
		expect(queryFn).toHaveBeenCalledOnce();
	});
});

describe("Effect queryFn", () => {
	it("runs the effect and interrupts it on abort", async () => {
		let interrupted = false;
		const qc = new QueryClient({ isServer: false });
		function slowQuery() {
			return effectQueryOptions({
				queryFn: () =>
					Effect.sleep(1000).pipe(
						Effect.as("slow"),
						Effect.onInterrupt(() =>
							Effect.sync(() => {
								interrupted = true;
							}),
						),
					),
				queryKey: ["slow"],
			});
		}
		function fastQuery() {
			return effectQueryOptions({
				queryFn: () => Effect.succeed("fast"),
				queryKey: ["fast"],
			});
		}

		expect(await qc.fetch(fastQuery)).toBe("fast");
		const slow = qc.fetch(slowQuery);
		await flush();
		qc.clear();

		await expect(slow).rejects.toBeInstanceOf(CancelledError);
		await flush();
		expect(interrupted).toBe(true);
	});
});

describe("garbage collection", () => {
	it("removes unread entries after gcTime", async () => {
		useFakeTimers();
		const backend = createBackend();
		const qc = new QueryClient({ defaults: { gcTime: 50 }, isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		const unsubscribe = query.subscribe(() => {});
		query.read();
		backend.respondAll();
		await vi.advanceTimersByTimeAsync(100);
		expect(qc.getAll()).toHaveLength(1);

		unsubscribe();
		await vi.advanceTimersByTimeAsync(50);

		expect(qc.getAll()).toHaveLength(0);
	});

	it("keeps everything on the server", async () => {
		useFakeTimers();
		const qc = new QueryClient({ isServer: true });
		await qc.fetch(() => queryOptions({ queryFn: () => 1, queryKey: ["n"] }));

		await vi.advanceTimersByTimeAsync(10 * 60_000);

		expect(qc.getAll()).toHaveLength(1);
	});
});

describe("window events", () => {
	it("refetch read, stale entries on focus and reconnect", async () => {
		const target = new EventTarget();
		vi.stubGlobal("window", target);
		vi.stubGlobal("document", { visibilityState: "visible" });
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const unmount = qc.mount();
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		query.subscribe(() => {});
		query.read();
		backend.respondAll();
		await flush();

		target.dispatchEvent(new Event("visibilitychange"));
		expect(backend.requests).toHaveLength(1);
		backend.respondAll();
		await flush();

		const unread = qc.fetch(backend.issueQuery, { id: 2 });
		backend.respondAll();
		await unread;
		target.dispatchEvent(new Event("online"));
		expect(backend.requests.map((request) => request.id)).toEqual([1]);

		unmount();
	});

	it("respect per-reader opt-outs", async () => {
		const target = new EventTarget();
		vi.stubGlobal("window", target);
		vi.stubGlobal("document", { visibilityState: "visible" });
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const unmount = qc.mount();
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		query.subscribe(() => {}, { refetchOnWindowFocus: false });
		query.read();
		backend.respondAll();
		await flush();

		target.dispatchEvent(new Event("visibilitychange"));

		expect(backend.requests).toHaveLength(0);
		unmount();
	});
});
