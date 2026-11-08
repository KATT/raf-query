import { type Group, isFetching } from "@raf-query/core";
import type { AnyFactory, AnyTarget } from "@raf-query/core/internal";
import { useCallback, useSyncExternalStore } from "react";

import { useQueryClient } from "./provider.tsx";

const serverCount = () => 0;

/**
 * How many queries have a request in flight: all of them, or a factory's,
 * a group's or a target's. For a global loading indicator. Always `0` on
 * the server and while hydrating, so the HTML matches the first browser render.
 */
export function useIsFetching(target?: AnyFactory | AnyTarget | Group): number {
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
	return useSyncExternalStore(subscribe, count, serverCount);
}
