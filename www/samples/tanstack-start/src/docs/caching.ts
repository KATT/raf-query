import { queryOptions } from "@raf-query/react";
import { getSettings } from "~/api.ts";

// #region initial-data
export function settingsQuery() {
	return queryOptions({
		queryKey: ["settings"],
		queryFn: () => getSettings(),
		staleTime: 60_000,
		initialData: { theme: "system" },
		// Stale at once: refetch the default the first time anything asks.
		initialDataUpdatedAt: 0,
	});
}
// #endregion
