import { type Plugin, plugin } from "../../client.ts";
import { refetchStaleReads } from "../shared.ts";

/**
 * What `focusRefetch()` declares.
 *
 * @see https://raf-query.katt.dev/docs/window-focus-refetching
 */
export interface FocusRefetch {
	readonly options: {
		/** `false`: don't refetch this query on focus. */
		readonly refetchOnWindowFocus?: boolean;
	};
}

/**
 * Refetch read, stale queries when the window regains focus, except those
 * with `refetchOnWindowFocus: false`.
 *
 * @see https://raf-query.katt.dev/docs/window-focus-refetching
 */
export function focusRefetch(): Plugin<FocusRefetch> {
	return plugin<FocusRefetch>({
		setup: (client, signal) => {
			const onFocus = () => {
				if (document.visibilityState === "visible") {
					refetchStaleReads(client, "refetchOnWindowFocus");
				}
			};
			document.addEventListener("visibilitychange", onFocus, { signal });
			window.addEventListener("focus", onFocus, { signal });
		},
	});
}
