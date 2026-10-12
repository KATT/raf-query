import { Effect } from "effect";

import type { QueryFnResult } from "./options.ts";

function isEffectResult<T>(
	result: QueryFnResult<T>,
): result is Effect.Effect<T, unknown> {
	return Effect.isEffect(result);
}

/**
 * One `queryFn` call as an Effect. The signal it gets aborts when the fiber
 * is interrupted; a returned Effect runs in the same fiber, so interrupting
 * the request interrupts it. Plain values settle like promises, a microtask
 * later.
 */
export function fromQueryFn<T>(
	call: (signal: AbortSignal) => QueryFnResult<T>,
): Effect.Effect<T, unknown> {
	return Effect.callback<T, unknown>((resume, signal) => {
		let result: QueryFnResult<T>;
		try {
			result = call(signal);
		} catch (error) {
			resume(Effect.fail(error));
			return;
		}
		if (isEffectResult(result)) {
			resume(result);
			return;
		}
		Promise.resolve(result).then(
			(value) => resume(Effect.succeed(value)),
			(error: unknown) => resume(Effect.fail(error)),
		);
	});
}
