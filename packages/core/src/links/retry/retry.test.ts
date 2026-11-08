/**
 * `retry()` is a link: the client runs every request through its links,
 * outermost first, and each link calls `next(op)` to run the rest of the
 * chain down to the query's own `queryFn`. `retry()` wraps that call in a
 * loop: when `next(op)` rejects, it waits on the client's `Clock`
 * (doubling from 1 s, at most 30 s, or `delay(attempt)`), waits for
 * `online` if `navigator.onLine` is `false`, and calls `next(op)` again.
 *
 * - Attempts: the query's `meta.retry` (a number, or `false` for none),
 *   else `attempts`, else 3. `meta.retry` is typed only on clients whose
 *   links include `retry()`.
 * - Never retried: `fail()` values (a `queryFn` returns them, so `next(op)`
 *   resolves), a thrown `Response` (a router redirect or not-found), what
 *   `when(error)` rules out, a request whose `op.signal` aborted, and
 *   anything on a server client.
 * - It writes nothing to the cache: the entry records whatever the last
 *   attempt ended with.
 *
 * `testClient(config)` is `createQueryClient({ clock, isServer: false,
 * ...config })` with a fake clock that `advance` moves.
 */
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	createQueryClient,
	fail,
	isQueryFailure,
	link,
	queryOptions,
	recommended,
	removeOne,
	retry,
	swr,
} from "../../index.ts";
import {
	advance,
	down,
	flaky,
	flush,
	issues,
	loadOne,
	testClient,
} from "../../test-utils.ts";

describe("retry()", () => {
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

describe("recommended()", () => {
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
