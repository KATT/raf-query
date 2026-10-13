import { Duration, Effect, Exit, Schedule } from "effect";

import { type RetryStrategy, RetryStrategyTypeId } from "../retry.ts";

/**
 * Retry on a `Schedule`, fed with each failure: `retry: retrySchedule(
 * Schedule.exponential("100 millis").pipe(Schedule.take(5)))`. Each request
 * steps a fresh copy; the schedule's delay is the wait before the next
 * attempt, and its end stops retrying.
 */
export function retrySchedule(
	schedule: Schedule.Schedule<unknown, unknown>,
): RetryStrategy {
	return {
		[RetryStrategyTypeId]: RetryStrategyTypeId,
		start(now) {
			const step = Effect.runSync(Schedule.toStep(schedule));
			return (_failureCount, error) => {
				const exit = Effect.runSyncExit(step(now(), error));
				return Exit.isSuccess(exit)
					? Duration.toMillis(exit.value[1])
					: undefined;
			};
		},
	};
}
