import { Predicate, Schedule } from "effect";

import type { QueryBehavior } from "./options.ts";

/**
 * A query's retry options, resolved: a `Schedule` passed as `retry`, or a
 * count / predicate with its delays. Counts and predicates don't build a
 * `Schedule`, so apps that never pass one don't bundle the `Schedule`
 * combinators.
 */
export type RetryPlan = Attempts | Schedule.Schedule<unknown>;

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
	if (Schedule.isSchedule(retry)) {
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
