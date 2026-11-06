import { type AnyFactory, type AnyTarget, isFetching } from "@raf-query/core";
import { useCallback, useSyncExternalStore } from "react";

import { useQueryClient } from "./provider.tsx";

/**
 * How many queries have a request in flight: all of them, a factory's, or
 * those a target (such as a group) matches. For a global loading indicator.
 */
export function useIsFetching(target?: AnyFactory | AnyTarget): number {
	const client = useQueryClient();
	const subscribe = useCallback(
		(onChange: () => void) =>
			client.subscribe((event) => {
				if (event.type === "updated" || event.type === "removed") {
					onChange();
				}
			}),
		[client],
	);
	const count = () => isFetching(client, target);
	return useSyncExternalStore(subscribe, count, count);
}
