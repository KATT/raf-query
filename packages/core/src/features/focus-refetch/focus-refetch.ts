import { type Feature, feature } from "../../client.ts";
import { refetchStaleReads } from "../shared.ts";

/** What `focusRefetch()` reads from a query's `meta`. */
export interface FocusRefetchMeta {
	/** `false`: don't refetch this query on focus. */
	readonly refetchOnWindowFocus?: boolean;
}

/**
 * Refetch read, stale queries when the window regains focus, except those
 * with `meta: { refetchOnWindowFocus: false }`.
 */
export function focusRefetch(): Feature<{ readonly meta: FocusRefetchMeta }> {
	return feature<{ readonly meta: FocusRefetchMeta }>((client, signal) => {
		const onFocus = () => {
			if (document.visibilityState === "visible") {
				refetchStaleReads(client, "refetchOnWindowFocus");
			}
		};
		document.addEventListener("visibilitychange", onFocus, { signal });
		window.addEventListener("focus", onFocus, { signal });
	});
}
