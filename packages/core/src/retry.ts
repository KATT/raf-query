import { type Effect, Predicate } from "effect";

import type { QueryBehavior } from "./options.ts";

export const RetryScheduleTypeId = "~@raf-query/core/RetrySchedule";

/**
 * Retries driven by an Effect `Schedule`, made by `retrySchedule`. Kept
 * behind that function so apps that never use a `Schedule` don't bundle
 * Effect's schedule driver.
 */
export interface RetrySchedule {
	/** Retry `attempt` on the schedule while `isStopped()` is false. */
	readonly retry: <A, E>(
		attempt: Effect.Effect<A, E>,
		isStopped: () => boolean,
	) => Effect.Effect<A, E>;
	readonly [RetryScheduleTypeId]: typeof RetryScheduleTypeId;
}

export const isRetrySchedule = (u: unknown): u is RetrySchedule =>
	Predicate.hasProperty(u, RetryScheduleTypeId);

/** A query's retry options, resolved. */
export type RetryPlan = Attempts | RetrySchedule;

export interface Attempts {
	/** Wait before retry number `failureCount` (1 after the first failure). */
	delay(failureCount: number, error: unknown): number;
	shouldRetry(failureCount: number, error: unknown): boolean;
}

/** Doubling from 1 s, at most 30 s. */
const defaultDelay = (failureCount: number) =>
	Math.min(1000 * 2 ** (failureCount - 1), 30_000);

/** The query's retry plan, or `undefined` when it doesn't retry. */
export function retryPlan(
	behavior: Pick<QueryBehavior, "retry" | "retryDelay">,
	isServer: boolean,
): RetryPlan | undefined {
	const retry = behavior.retry ?? (isServer ? 0 : 3);
	if (isRetrySchedule(retry)) {
		return retry;
	}
	if (retry === false || retry === 0) {
		return undefined;
	}
	const retryDelay = behavior.retryDelay;
	return {
		delay:
			retryDelay === undefined
				? defaultDelay
				: Predicate.isNumber(retryDelay)
					? () => retryDelay
					: retryDelay,
		shouldRetry:
			retry === true
				? () => true
				: Predicate.isNumber(retry)
					? (failureCount) => failureCount <= retry
					: retry,
	};
}
