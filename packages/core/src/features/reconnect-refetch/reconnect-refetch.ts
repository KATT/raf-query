import { type Feature, feature } from "../../client.ts";
import { refetchStaleReads } from "../shared.ts";

/** What `reconnectRefetch()` reads from a query's `meta`. */
export interface ReconnectRefetchMeta {
	/** `false`: don't refetch this query when the browser comes back online. */
	readonly refetchOnReconnect?: boolean;
}

/**
 * Refetch read, stale queries when the browser comes back online, except
 * those with `meta: { refetchOnReconnect: false }`.
 *
 * @see https://raf-query.katt.dev/docs/testing#focus-and-the-network
 */
export function reconnectRefetch(): Feature<{
	readonly meta: ReconnectRefetchMeta;
}> {
	return feature<{ readonly meta: ReconnectRefetchMeta }>((client, signal) => {
		window.addEventListener(
			"online",
			() => refetchStaleReads(client, "refetchOnReconnect"),
			{ signal },
		);
	});
}
