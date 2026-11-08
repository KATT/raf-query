import { type Clock, type Link, link } from "../../client.ts";
import { isResponse } from "../../guards.ts";

export interface RetryOptions {
	/** Retries after the first attempt. A query's `meta.retry` wins. Default 3. */
	readonly attempts?: number;
	/** Wait before retry `n` (0-based), in ms. Default: doubling from 1 s, at most 30 s. */
	readonly delay?: (attempt: number) => number;
	/** Whether an error is worth retrying. Default: every error but a thrown `Response`. */
	readonly when?: (error: unknown) => boolean;
}

function wait(clock: Clock, ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			clock.clearTimeout(handle);
			reject(signal.reason);
		};
		const handle = clock.setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

function whenOnline(signal: AbortSignal): Promise<void> {
	if (navigator.onLine !== false) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		window.addEventListener("online", () => resolve(), { once: true, signal });
	});
}

const defaultDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000);

/** Routers throw a `Response` for a redirect or a not-found: control flow, not a failure. */
const notThrownResponse = (error: unknown) => !isResponse(error);

/** What `retry()` reads from a query's `meta`. */
export interface RetryMeta {
	/** Attempts for this query, or `false`. */
	readonly retry?: number | false;
}

/**
 * Retry failed requests. Expected errors (`fail()`), thrown `Response`s
 * (router redirects and not-founds) and cancelled requests aren't retried,
 * server clients never retry, and a browser that is offline
 * waits until it's back online before retrying. A query sets its own
 * attempts with `meta: { retry }`.
 */
export function retry(
	options: RetryOptions = {},
): Link<{ readonly meta: RetryMeta }> {
	return link<{ readonly meta: RetryMeta }>(async (op, next) => {
		const configured = op.meta.retry;
		const attempts =
			configured === false ? 0 : (configured ?? options.attempts ?? 3);
		if (op.client.isServer || attempts === 0) {
			return next(op);
		}
		for (let attempt = 0; ; attempt++) {
			try {
				return await next(op);
			} catch (error) {
				if (
					attempt >= attempts ||
					op.signal.aborted ||
					!(options.when ?? notThrownResponse)(error)
				) {
					throw error;
				}
				await wait(
					op.client.clock,
					(options.delay ?? defaultDelay)(attempt),
					op.signal,
				);
				await whenOnline(op.signal);
			}
		}
	});
}
