/** `"focus"`: the page became visible. `"online"`: the browser reconnected. */
export type PlatformEvent = "focus" | "online";

/**
 * The page a cache runs in: whether there is one, and its focus and network
 * state. The default ({@link globalPlatform}) reads the global `window`,
 * `document` and `navigator`; pass another as `config.platform` to run a
 * cache against a fake page.
 */
export interface Platform {
	isOnlineUnsafe(): boolean;
	/** No page to watch: a server render. */
	readonly isServer: boolean;
	isVisibleUnsafe(): boolean;
	/** Call `listener` on every focus and reconnect until unsubscribed. */
	subscribeUnsafe(listener: (event: PlatformEvent) => void): () => void;
}

export const globalPlatform: Platform = {
	isOnlineUnsafe: () =>
		!("window" in globalThis) ||
		!("navigator" in globalThis) ||
		!("onLine" in navigator) ||
		navigator.onLine,
	get isServer() {
		return !("window" in globalThis);
	},
	isVisibleUnsafe: () =>
		!("document" in globalThis) || document.visibilityState !== "hidden",
	subscribeUnsafe(listener) {
		if (!("window" in globalThis)) {
			return () => {};
		}
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				listener("focus");
			}
		};
		const onOnline = () => listener("online");
		window.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("online", onOnline);
		return () => {
			window.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("online", onOnline);
		};
	},
};

/**
 * Resolves now if `platform` is online, else on its next `"online"` event,
 * or when `signal` aborts.
 */
export function whenOnline(
	platform: Platform,
	signal: AbortSignal,
): Promise<void> {
	if (platform.isOnlineUnsafe() || signal.aborted) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const done = () => {
			unsubscribe();
			signal.removeEventListener("abort", done);
			resolve();
		};
		const unsubscribe = platform.subscribeUnsafe((event) => {
			if (event === "online") {
				done();
			}
		});
		signal.addEventListener("abort", done, { once: true });
	});
}
