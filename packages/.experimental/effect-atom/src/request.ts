import type {
	QueryBehavior,
	QueryFnResult,
	QueryOptions,
} from "@raf-query/core";
import { Effect, Predicate, Schedule } from "effect";

/** Doubling from 1 s, at most 30 s. */
const defaultDelays = Schedule.min([
	Schedule.exponential("1 second"),
	Schedule.spaced("30 seconds"),
]);

function delays(
	retryDelay: QueryBehavior["retryDelay"],
): Schedule.Schedule<unknown> {
	if (retryDelay === undefined) {
		return defaultDelays;
	}
	if (Predicate.isNumber(retryDelay)) {
		return Schedule.spaced(retryDelay);
	}
	return Schedule.forever.pipe(
		Schedule.modifyDelay((step) =>
			Effect.succeed(retryDelay(step.attempt, step.input)),
		),
	);
}

/**
 * A query's retry options as one `Schedule`, or `undefined` when it doesn't
 * retry. A count or predicate in `retry` gets the attempt number (1 after
 * the first failure) and the error.
 */
function retrySchedule(
	behavior: QueryBehavior,
	isServer: boolean,
): Schedule.Schedule<unknown, unknown> | undefined {
	const retry = behavior.retry ?? (isServer ? 0 : 3);
	if (Schedule.isSchedule(retry)) {
		return retry;
	}
	if (retry === false || retry === 0) {
		return undefined;
	}
	const schedule = delays(behavior.retryDelay);
	if (retry === true) {
		return schedule;
	}
	return schedule.pipe(
		Schedule.while((step) =>
			Predicate.isNumber(retry)
				? step.attempt <= retry
				: retry(step.attempt, step.input),
		),
	);
}

function isEffectResult<T, E>(
	result: QueryFnResult<T, E>,
): result is Effect.Effect<T, E> {
	return Effect.isEffect(result);
}

/**
 * One `queryFn` call as an Effect. The signal aborts when the fiber is
 * interrupted (the atom is refreshed or disposed). A `queryFn` that throws
 * instead of returning is a defect, so it isn't retried.
 */
function fromQueryFn<T, E>(
	call: (signal: AbortSignal) => QueryFnResult<T, E>,
): Effect.Effect<T, E> {
	return Effect.callback<T, E>((resume, signal) => {
		let result: QueryFnResult<T, E>;
		try {
			result = call(signal);
		} catch (error) {
			resume(Effect.die(error));
			return;
		}
		if (isEffectResult(result)) {
			resume(result);
			return;
		}
		Promise.resolve(result).then(
			(value) => resume(Effect.succeed(value)),
			// A rejection's type is unknown; `E` is `unknown` for every
			// `queryFn` that returns a promise.
			(error: E) => resume(Effect.fail(error)),
		);
	});
}

/** A query's request: its `queryFn`, retried per its policy. */
export function request(
	options: QueryOptions<unknown, unknown>,
	behavior: QueryBehavior,
	isServer: boolean,
): Effect.Effect<unknown, unknown> {
	const queryKey = options.queryKey;
	const once = fromQueryFn((signal) => options.queryFn({ queryKey, signal }));
	const schedule = retrySchedule(behavior, isServer);
	return schedule ? Effect.retry(once, schedule) : once;
}
