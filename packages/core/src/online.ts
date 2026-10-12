import { Effect } from "effect";

function isOffline() {
	return (
		"window" in globalThis &&
		"navigator" in globalThis &&
		"onLine" in navigator &&
		!navigator.onLine
	);
}

/**
 * Succeeds now if the browser is online, else on the window's next `online`
 * event. Interrupting it removes the listener.
 */
export const whenOnline: Effect.Effect<void> = Effect.suspend(() =>
	isOffline()
		? Effect.callback<void>((resume) => {
				const onOnline = () => resume(Effect.void);
				window.addEventListener("online", onOnline, { once: true });
				return Effect.sync(() =>
					window.removeEventListener("online", onOnline),
				);
			})
		: Effect.void,
);
