function isOffline() {
	return (
		"window" in globalThis &&
		"navigator" in globalThis &&
		"onLine" in navigator &&
		!navigator.onLine
	);
}

/**
 * Resolves now if the browser is online, else on the window's next `online`
 * event. Aborting `signal` removes the listener and rejects with its reason.
 */
export function whenOnline(signal: AbortSignal): Promise<void> {
	if (!isOffline()) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		const onOnline = () => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		};
		const onAbort = () => {
			window.removeEventListener("online", onOnline);
			reject(signal.reason);
		};
		window.addEventListener("online", onOnline, { once: true });
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

/** Resolves after `ms`; aborting `signal` clears the timer and rejects. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
