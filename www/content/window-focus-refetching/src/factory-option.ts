import { queryOptions } from "@raf-query/react";

import { getSettings } from "./api";

// #region factory
export function settingsQuery() {
	return queryOptions({
		queryKey: ["settings"],
		queryFn: () => getSettings(),
		refetchOnWindowFocus: false,
	});
}
// #endregion
