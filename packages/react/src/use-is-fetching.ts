"use client";

import type { QueryClient, QueryFilter } from "@raf-query/core";
import { useCallback, useSyncExternalStore } from "react";

import { useQueryClient } from "./provider.tsx";

// Cache events fire synchronously, sometimes while another component renders
// (a read that starts a fetch), so React hears about them in a microtask,
// once per batch.
function subscribeDeferred(client: QueryClient, onStoreChange: () => void) {
	let scheduled = false;
	return client.subscribe(() => {
		if (scheduled) {
			return;
		}
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			onStoreChange();
		});
	});
}

/**
 * How many queries have a request in flight: all of them, or those matching
 * `filter`. Re-renders when the count changes, for global loading
 * indicators:
 *
 * ```tsx
 * const fetching = useIsFetching();
 * return fetching > 0 ? <ProgressBar /> : null;
 * ```
 */
export function useIsFetching(filter?: QueryFilter): number {
	const client = useQueryClient();
	const subscribe = useCallback(
		(onStoreChange: () => void) => subscribeDeferred(client, onStoreChange),
		[client],
	);
	const getSnapshot = () => client.isFetching(filter);
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
