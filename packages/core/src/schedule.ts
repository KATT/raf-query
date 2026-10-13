import { Effect, type Schedule } from "effect";

import { type RetrySchedule, RetryScheduleTypeId } from "./retry.ts";

/**
 * Retry a query on an Effect `Schedule`: `retry: retrySchedule(schedule)`.
 * Retries still wait while the browser is offline, and stop when nobody
 * reads the query anymore.
 */
export function retrySchedule(
	schedule: Schedule.Schedule<unknown, unknown>,
): RetrySchedule {
	return {
		retry: (attempt, isStopped) =>
			Effect.retry(attempt, { schedule, while: () => !isStopped() }),
		[RetryScheduleTypeId]: RetryScheduleTypeId,
	};
}
