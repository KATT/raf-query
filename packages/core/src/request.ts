import { Context, Effect, Scope } from "effect";

import type { QueryFnResult } from "./options.ts";

function isEffectResult<T, E, R>(
	result: QueryFnResult<T, E, R>,
): result is Effect.Effect<T, E, R> {
	return Effect.isEffect(result);
}

/**
 * One `queryFn` call as an Effect. The signal it gets aborts when the fiber
 * is interrupted; a returned Effect runs in the same fiber, so interrupting
 * the request interrupts it. Plain values settle like promises, a microtask
 * later. A `queryFn` that throws instead of returning is a defect, as in
 * `Effect.sync`.
 */
export function fromQueryFn<T, E, R>(
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

/**
 * The services a request runs with: the cache's, under those of the verb
 * that last called for the entry. The caller's `Scope` is left out: a
 * request outlives the call that started it.
 */
export function requestServices(
	cache: Context.Context<never>,
	caller: Context.Context<never>,
): Context.Context<never> {
	return Context.merge(cache, Context.omit(Scope.Scope)(caller));
}

/**
 * A request as it runs, with `services`, which hold what its `queryFn`
 * Effect needs (entries erase that type with the data's). Typed failures
 * become the query's error. Defects do too, and are reported on the
 * console: `Effect.logError` would put Effect's logger in every app.
 */
export function runRequest<A, E>(
	request: Effect.Effect<A, E>,
	services: Context.Context<never>,
): Effect.Effect<A, E> {
	return request.pipe(
		Effect.tapDefect((defect) =>
			Effect.sync(() => {
				// oxlint-disable-next-line eslint/no-console -- a defect is a bug; React reports errors the same way
				console.error("raf-query: queryFn died", defect);
			}),
		),
		Effect.provideContext(services),
	);
}
