import {
	createQueryClient,
	focusRefetch,
	invalidateOnAction,
	polling,
	queryOptions,
	recommended,
	reconnectRefetch,
	retry,
} from "@raf-query/react";
import { getSettings } from "~/api.ts";
import { account } from "~/queries.ts";

// #region the-features
const queryClient = createQueryClient({
	features: [focusRefetch(), reconnectRefetch()],
});
// or
const withEverything = createQueryClient({ ...recommended() });
// #endregion

// #region turning-it-off
// `recommended()` without focusRefetch() and reconnectRefetch()
const withoutFocus = createQueryClient({
	links: [retry()],
	features: [polling(), invalidateOnAction()],
});
// #endregion

// #region per-query
export function settingsQuery() {
	return queryOptions({
		queryKey: [account, "settings"],
		queryFn: () => getSettings(),
		meta: { refetchOnWindowFocus: false },
	});
}
// #endregion
