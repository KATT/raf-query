import { type Clock, type Plugin, plugin } from "../../client.ts";
import { isResponse } from "../../guards.ts";

/**
 * Options for {@link retry}.
 *
 * @see https://raf-query.katt.dev/docs/retries#options
 */
export interface RetryOptions {
	/** Retries after the first attempt. A query's `retry`, or the client's default for it, wins. Default 3. */
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

/**
 * What `retry()` declares.
 *
 * @see https://raf-query.katt.dev/docs/retries
 */
export interface Retry {
	readonly options: {
		/** Attempts for this query, or `false`. */
		readonly retry?: number | false;
	};
}

/**
 * Retry failed requests. Thrown `Response`s (router redirects and
 * not-founds) and cancelled requests aren't retried,
 * server clients never retry, and a browser that is offline
 * waits until it's back online before retrying. A query sets its own
 * attempts with `retry`.
 *
 * @see https://raf-query.katt.dev/docs/retries
 */
export function retry(options: RetryOptions = {}): Plugin<Retry> {
	return plugin<Retry>({
		link: async (op, next) => {
			const configured = op.options.retry;
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
		},
	});
}
