import { type Plugin, plugin } from "../../client.ts";
import { refetchStaleReads } from "../shared.ts";

/**
 * What `reconnectRefetch()` declares.
 *
 * @see https://raf-query.katt.dev/docs/testing#focus-and-the-network
 */
export interface ReconnectRefetch {
	readonly options: {
		/** `false`: don't refetch this query when the browser comes back online. */
		readonly refetchOnReconnect?: boolean;
	};
}

/**
 * Refetch read, stale queries when the browser comes back online, except
 * those with `refetchOnReconnect: false`.
 *
 * @see https://raf-query.katt.dev/docs/testing#focus-and-the-network
 */
export function reconnectRefetch(): Plugin<ReconnectRefetch> {
	return plugin<ReconnectRefetch>({
		setup: (client, signal) => {
			window.addEventListener(
				"online",
				() => refetchStaleReads(client, "refetchOnReconnect"),
				{ signal },
			);
		},
	});
}
