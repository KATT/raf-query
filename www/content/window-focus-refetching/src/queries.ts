import { queryOptions } from "@raf-query/react";

import { getSettings } from "./api";

export function settingsQuery() {
	return queryOptions({
		queryKey: ["settings"],
		queryFn: () => getSettings(),
	});
}
