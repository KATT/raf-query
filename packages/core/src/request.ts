import { Effect } from "effect";

import type { QueryFnResult } from "./options.ts";

function isEffectResult<T, E>(
	result: QueryFnResult<T, E>,
): result is Effect.Effect<T, E> {
	return Effect.isEffect(result);
}

/**
 * One `queryFn` call as an Effect. The signal it gets aborts when the fiber
 * is interrupted; a returned Effect runs in the same fiber, so interrupting
 * the request interrupts it. Plain values settle like promises, a microtask
 * later. A `queryFn` that throws instead of returning is a defect, as in
 * `Effect.sync`.
 */
export function fromQueryFn<T, E>(
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
