import type { Clock, Link } from "./client.ts";

export interface RetryOptions {
	/** Retries after the first attempt. A query's `retry` option wins. Default 3. */
	readonly attempts?: number;
	/** Wait before retry `n` (0-based), in ms. Default: doubling from 1 s, at most 30 s. */
	readonly delay?: (attempt: number) => number;
	/** Whether an error is worth retrying. Default: every error. */
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
	if (!("navigator" in globalThis) || navigator.onLine !== false) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		window.addEventListener("online", () => resolve(), { once: true, signal });
	});
}

const defaultDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000);

/**
 * Retry failed requests. Expected errors (`fail()`) and cancelled requests
 * aren't retried, server clients never retry, and a browser that is offline
 * waits until it's back online before retrying.
 */
export function retry(options: RetryOptions = {}): Link {
	return async (op, next) => {
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
					!(options.when?.(error) ?? true)
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
	};
}

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
