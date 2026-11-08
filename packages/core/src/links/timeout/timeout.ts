import type { Link } from "../../client.ts";

/** What a request that took too long fails with. */
export class QueryTimeoutError extends Error {
	override readonly name = "QueryTimeoutError";
}

/** Fail a request (and abort its `signal`) when it takes longer than `ms`. */
export function timeout(ms: number): Link {
	return (op, next) => {
		const controller = new AbortController();
		const signal = AbortSignal.any([op.signal, controller.signal]);
		return new Promise((resolve, reject) => {
			const handle = op.client.clock.setTimeout(() => {
				const error = new QueryTimeoutError(
					`Query ${op.hash} took longer than ${ms} ms`,
				);
				controller.abort(error);
				reject(error);
			}, ms);
			next({ ...op, signal })
				.then(resolve, reject)
				.finally(() => {
					op.client.clock.clearTimeout(handle);
				});
		});
	};
}
