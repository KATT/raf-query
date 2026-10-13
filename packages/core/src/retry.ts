import type { QueryBehavior } from "./options.ts";
import { hasProperty, isNumber } from "./predicate.ts";

export const RetryStrategyTypeId = "~@raf-query/core/RetryStrategy";

/**
 * Decides, after each failure of one request, whether to retry and after how
 * long: the delay in ms, or `undefined` to stop. `failureCount` is 1 after
 * the first failure.
 */
export type RetryStep = (
	failureCount: number,
	error: unknown,
) => number | undefined;

/**
 * A stateful retry policy, such as `retrySchedule(schedule)` from
 * `@raf-query/core/effect`: `start` is called once per request, and its step
 * with every failure of that request.
 */
export interface RetryStrategy {
	readonly [RetryStrategyTypeId]: typeof RetryStrategyTypeId;
	start(now: () => number): RetryStep;
}

export function isRetryStrategy(value: unknown): value is RetryStrategy {
	return hasProperty(value, RetryStrategyTypeId);
}

/** Doubling from 1 s, at most 30 s. */
const defaultDelay = (failureCount: number) =>
	Math.min(1000 * 2 ** (failureCount - 1), 30_000);

/** The step for one request's retries, or `undefined` when it doesn't retry. */
export function startRetries(
	behavior: Pick<QueryBehavior, "retry" | "retryDelay">,
	isServer: boolean,
	now: () => number,
): RetryStep | undefined {
	const retry = behavior.retry ?? (isServer ? 0 : 3);
	if (isRetryStrategy(retry)) {
		return retry.start(now);
	}
	if (retry === false || retry === 0) {
		return undefined;
	}
	const retryDelay = behavior.retryDelay;
	const delay =
		retryDelay === undefined
			? defaultDelay
			: isNumber(retryDelay)
				? () => retryDelay
				: retryDelay;
	const shouldRetry =
		retry === true
			? () => true
			: isNumber(retry)
				? (failureCount: number) => failureCount <= retry
				: retry;
	return (failureCount, error) =>
		shouldRetry(failureCount, error) ? delay(failureCount, error) : undefined;
}
