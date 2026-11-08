import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	createQueryClient,
	fail,
	isQueryFailure,
	link,
	load,
	type LoadEntry,
	type QueryClient,
	queryOptions,
	QueryTimeoutError,
	recommended,
	removeOne,
	retry,
	swr,
	timeout,
} from "./index.ts";
import { advance, flush, issues, testClient } from "./test-utils.ts";

/** A query that fails with `errors` in turn, then answers with how many attempts it took. */
function flaky(errors: ReadonlyArray<unknown>) {
	const signals: Array<AbortSignal> = [];
	const query = () =>
		queryOptions({
			queryFn: async (context) => {
				signals.push(context.signal);
				const error = errors[signals.length - 1];
				if (error !== undefined) {
					throw error;
				}
				return signals.length;
			},
			queryKey: issues("flaky"),
		});
	return { attempts: () => signals.length, query, signals };
}

interface Outcome {
	done?: boolean;
	error?: unknown;
	value?: unknown;
}

/** Start loading `entry` and report how it ends, without waiting for it. */
async function loadOne(client: QueryClient, entry: LoadEntry) {
	const outcome: Outcome = {};
	load(client, { value: entry }).then(
		([handles]) => Object.assign(outcome, { done: true, value: handles }),
		(error: unknown) => Object.assign(outcome, { done: true, error }),
	);
	await flush();
	return outcome;
}

const down = new Error("down");

describe("retry", () => {
	it("retries after growing delays, and gives up after its attempts", async () => {
		const flakes = flaky([down, down, down, down]);
		const client = testClient({ links: [retry()] });
		const outcome = await loadOne(client, swr(flakes.query));

		for (const [wait, attempts] of [
			[999, 1],
			[1, 2],
			[2000, 3],
			[4000, 4],
		] as const) {
			advance(client, wait);
			// oxlint-disable-next-line no-await-in-loop -- one retry at a time
			await flush();
			expect(flakes.attempts()).toBe(attempts);
		}
		expect(outcome.error).toBe(down);
	});

	it("retries until it succeeds, with its own attempts and delays", async () => {
		const flakes = flaky([down, down]);
		const client = testClient({
			links: [retry({ attempts: 2, delay: () => 10 })],
		});
		const outcome = await loadOne(client, swr(flakes.query));
		advance(client, 10);
		await flush();
		advance(client, 10);
		await flush();

		expect(outcome.done).toBe(true);
		expect(flakes.attempts()).toBe(3);
	});

	it("follows a query's own attempts, typed by its client's links", async () => {
		const makeClient = () =>
			createQueryClient({
				clock: testClient().clock,
				isServer: false,
				links: [retry({ delay: () => 0 })],
			});
		const boundQueryOptions = bindQueryOptions<typeof makeClient>();
		const boundInfiniteQueryOptions =
			bindInfiniteQueryOptions<typeof makeClient>();
		const attempts = new Map<string, number>();
		const attempt = (name: string) => {
			attempts.set(name, (attempts.get(name) ?? 0) + 1);
			throw down;
		};
		const failing = (input: { readonly retry: number | false }) =>
			boundQueryOptions({
				meta: { retry: input.retry },
				queryFn: async () => attempt(String(input.retry)),
				queryKey: issues("failing", input),
			});
		const failingPages = () =>
			boundInfiniteQueryOptions({
				getNextPageParam: () => null,
				initialPageParam: 0,
				meta: { retry: 1 },
				queryFn: async () => attempt("pages"),
				queryKey: issues("failing-pages"),
			});
		const client = makeClient();
		const once = await loadOne(client, swr(failing, { retry: 1 }));
		const never = await loadOne(client, swr(failing, { retry: false }));
		const pages = await loadOne(client, swr(failingPages));
		advance(client, 0);
		await flush();

		expect([once.error, never.error, pages.error]).toEqual([down, down, down]);
		expect(Object.fromEntries(attempts)).toEqual({
			1: 2,
			false: 1,
			pages: 2,
		});
	});

	it("doesn't retry an expected error, a thrown Response, or what `when` rules out", async () => {
		const response = flaky([new Response(null, { status: 302 })]);
		const ruledOut = flaky([down]);
		await loadOne(testClient({ links: [retry()] }), swr(response.query));
		await loadOne(
			testClient({ links: [retry({ when: (error) => error !== down })] }),
			swr(ruledOut.query),
		);
		let goneCalls = 0;
		const gone = () =>
			queryOptions({
				queryFn: () => {
					goneCalls += 1;
					return fail({ _tag: "Gone" });
				},
				queryKey: issues("expected"),
			});
		const expected = await loadOne(testClient({ links: [retry()] }), swr(gone));

		expect([response.attempts(), ruledOut.attempts(), goneCalls]).toEqual([
			1, 1, 1,
		]);
		expect(expected.error).toSatisfy(isQueryFailure);
	});

	it("never retries on the server", async () => {
		const flakes = flaky([down]);
		const outcome = await loadOne(
			testClient({ isServer: true, links: [retry({ delay: () => 0 })] }),
			swr(flakes.query),
		);

		expect(outcome.error).toBe(down);
		expect(flakes.attempts()).toBe(1);
	});

	it("stops when the query is removed, waiting or mid-request", async () => {
		const flakes = flaky([down, down]);
		const client = testClient({ links: [retry({ delay: () => 10 })] });
		await loadOne(client, swr(flakes.query));
		removeOne(client, flakes.query);
		advance(client, 100);
		await flush();
		expect(flakes.attempts()).toBe(1);

		const aborted = Promise.withResolvers<never>();
		const slow = () =>
			queryOptions({
				queryFn: (context) => {
					context.signal.addEventListener("abort", () =>
						aborted.reject(context.signal.reason),
					);
					return aborted.promise;
				},
				queryKey: issues("slow"),
			});
		let calls = 0;
		const counting = testClient({
			links: [
				retry({ delay: () => 0 }),
				link((op, next) => {
					calls += 1;
					return next(op);
				}),
			],
		});
		await loadOne(counting, swr(slow));
		removeOne(counting, slow);
		advance(counting, 100);
		await flush();
		expect(calls).toBe(1);
	});

	it("waits until the browser is back online", async () => {
		const flakes = flaky([down]);
		const client = testClient({ links: [retry({ delay: () => 0 })] });
		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const outcome = await loadOne(client, swr(flakes.query));
		advance(client, 100);
		await flush();
		expect(flakes.attempts()).toBe(1);

		online.mockReturnValue(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		await flush();
		expect(outcome.done).toBe(true);
		expect(flakes.attempts()).toBe(2);
	});
});

describe("timeout", () => {
	it("fails and aborts a request that takes too long", async () => {
		const hanging = () =>
			queryOptions({
				queryFn: () => new Promise<never>(() => {}),
				queryKey: issues("hanging"),
			});
		let signal: AbortSignal | undefined;
		const client = testClient({
			links: [
				timeout(100),
				link((op, next) => {
					signal = op.signal;
					return next(op);
				}),
			],
		});
		const outcome = await loadOne(client, swr(hanging));
		advance(client, 100);
		await flush();

		expect(outcome.error).toBeInstanceOf(QueryTimeoutError);
		expect(signal?.reason).toBe(outcome.error);
	});

	it("lets faster requests and their errors through", async () => {
		const client = testClient({ links: [timeout(100)] });
		const fast = await loadOne(client, swr(flaky([]).query));
		const failing = await loadOne(
			testClient({ links: [timeout(100)] }),
			swr(flaky([down]).query),
		);
		advance(client, 200);

		expect(fast.value).toBeDefined();
		expect(failing.error).toBe(down);
	});
});

describe("the recommended setup", () => {
	it("retries failed requests", async () => {
		const flakes = flaky([down]);
		const client = testClient(recommended());
		const outcome = await loadOne(client, swr(flakes.query));
		advance(client, 1000);
		await flush();

		expect(outcome.done).toBe(true);
		expect(flakes.attempts()).toBe(2);
	});
});
