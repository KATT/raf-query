import { describe, expect, it, onTestFinished, vi } from "@effect/vitest";
import { Effect } from "effect";

import { Query, QueryObserver } from "./index.ts";
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

describe("QueryObserver", () => {
	it("notifies on every result change while nothing is tracked", async () => {
		const test = await setup();
		const observer = new QueryObserver(test.query);
		const listener = vi.fn();
		observer.subscribe(listener);

		Effect.runFork(Query.refetch(test.query));
		await flush();
		expect(listener).toHaveBeenCalledOnce();
		expect(observer.getCurrentResult().isFetching).toBe(true);
	});

	it("notifies only for tracked properties once one is read", async () => {
		const test = await setup();
		const observer = new QueryObserver(test.query);
		const listener = vi.fn();
		observer.subscribe(listener);
		const result = observer.trackResult(observer.getCurrentResult());
		void result.promise;

		Effect.runFork(Query.refetch(test.query));
		await flush();
		expect(listener).not.toHaveBeenCalled();

		test.backend.issues.set(1, { id: 1, title: "Renamed" });
		test.backend.respondAll();
		await flush();
		expect(listener).toHaveBeenCalledOnce();

		void observer.trackResult(observer.getCurrentResult()).isFetching;
		Effect.runFork(Query.refetch(test.query));
		await flush();
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("keeps the previous query's data with whilePending: previous", async () => {
		const test = await setup();
		const options = { whilePending: "previous" } as const;
		const observer = new QueryObserver(test.query, options);
		observer.subscribe(() => {});
		const second = test.qc.getQueryUnsafe(test.backend.issueQuery, {
			id: 2,
		});
		Query.readUnsafe(second);

		observer.setOptions(second, options);
		expect(observer.getCurrentResult()).toMatchObject({
			input: { id: 1 },
			isPending: true,
			isPrevious: true,
			key: ["issue", 1],
			promise: Query.getUnsafe(test.query).promise,
		});

		test.backend.respondAll();
		await flush();
		expect(observer.getCurrentResult()).toMatchObject({
			input: { id: 2 },
			isPrevious: false,
			promise: Query.getUnsafe(second).promise,
		});
	});

	it("refetches on refetchInterval while subscribed", async () => {
		const test = await setup();
		vi.useFakeTimers();
		onTestFinished(() => {
			vi.useRealTimers();
		});
		const observer = new QueryObserver(test.query, { refetchInterval: 1000 });
		const unsubscribe = observer.subscribe(() => {});

		vi.advanceTimersByTime(1000);
		expect(test.backend.requests).toHaveLength(1);
		test.backend.respondAll();

		unsubscribe();
		vi.advanceTimersByTime(5000);
		expect(test.backend.requests).toHaveLength(0);
	});
});
