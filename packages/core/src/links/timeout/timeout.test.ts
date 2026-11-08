/**
 * `timeout(ms)` is a link (see `../retry/retry.test.ts` for how links run).
 * It calls `next(op)` with a signal that also aborts on its own timer, set
 * on the client's `Clock`. If `next(op)` hasn't settled after `ms`, it
 * aborts that signal with a `QueryTimeoutError` and rejects with it; a
 * request that settles first clears the timer and passes through as it
 * is. It reads no `meta` and writes nothing to the cache.
 */
import { describe, expect, it } from "vitest";

import {
	link,
	queryOptions,
	QueryTimeoutError,
	swr,
	timeout,
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

describe("timeout(ms)", () => {
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
