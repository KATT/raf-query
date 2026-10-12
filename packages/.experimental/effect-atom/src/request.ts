import type { QueryBehavior } from "@raf-query/core";
import { Context, Effect, Predicate, Schedule } from "effect";

import type { QueryFnResult, QueryOptions } from "./options.ts";

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

function isEffectResult<T, E, R>(
	result: QueryFnResult<T, E, R>,
): result is Effect.Effect<T, E, R> {
	return Effect.isEffect(result);
}

/**
 * One `queryFn` call as an Effect. The signal aborts when the fiber is
 * interrupted (the atom is refreshed or disposed). A `queryFn` that throws
 * instead of returning is a defect, so it isn't retried.
 */
function fromQueryFn<T, E, R>(
	call: (signal: AbortSignal) => QueryFnResult<T, E, R>,
): Effect.Effect<T, E, R> {
	return Effect.callback<T, E, R>((resume, signal) => {
		let result: QueryFnResult<T, E, R>;
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

export interface RequestOptions {
	readonly behavior: QueryBehavior;
	readonly hash: string;
	readonly isServer: boolean;
	readonly options: QueryOptions<unknown, unknown, never>;
	/** What the `queryFn`'s Effect may read, beneath the atom's own services. */
	readonly services: Context.Context<never>;
}

/**
 * A query's request: its `queryFn`, retried per its policy, in a
 * `raf-query.request` span. Typed failures are the query's state; defects
 * are also logged, since nothing else reports them.
 */
export function request(
	input: RequestOptions,
): Effect.Effect<unknown, unknown> {
	const queryKey = input.options.queryKey;
	const once = fromQueryFn<unknown, unknown, never>((signal) =>
		input.options.queryFn({ queryKey, signal }),
	);
	const schedule = retrySchedule(input.behavior, input.isServer);
	const traced = (schedule ? Effect.retry(once, schedule) : once).pipe(
		Effect.tapDefect((defect) =>
			Effect.logError("raf-query: queryFn died", defect),
		),
		Effect.withSpan("raf-query.request", {
			attributes: { "raf_query.hash": input.hash },
		}),
	);
	// The atom's own services (its Scope, the registry) win.
	return Effect.updateContext(traced, (atom: Context.Context<never>) =>
		Context.merge(input.services, atom),
	);
}
