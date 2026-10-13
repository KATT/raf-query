/**
 * Time, for a cache's timers (gc, staleness, retry delays, polling).
 * `@raf-query/core/effect` passes one backed by Effect's `Clock`, so
 * `TestClock` drives them.
 */
export interface Clock {
	/** Milliseconds since the epoch. */
	now(): number;
	/** Call `callback` after `ms`. The returned function cancels it. */
	schedule(callback: () => void, ms: number): () => void;
}

/** `setTimeout`'s limit; longer delays would fire at once. */
const maxDelay = 2 ** 31 - 1;

export const systemClock: Clock = {
	now: () => Date.now(),
	schedule(callback, ms) {
		const timer = setTimeout(callback, Math.min(ms, maxDelay));
		return () => clearTimeout(timer);
	},
};

/** Resolves after `ms`, or as soon as `signal` aborts. */
export function sleep(
	clock: Clock,
	ms: number,
	signal: AbortSignal,
): Promise<void> {
	if (signal.aborted) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const done = () => {
			cancel();
			signal.removeEventListener("abort", done);
			resolve();
		};
		const cancel = clock.schedule(done, ms);
		signal.addEventListener("abort", done, { once: true });
	});
}
