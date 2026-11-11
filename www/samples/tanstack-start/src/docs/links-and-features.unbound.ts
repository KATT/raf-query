import { getMe } from "~/api.ts";
import { account } from "~/queries.ts";

// #region unbound
import { queryOptions } from "@raf-query/react";

export function meQuery() {
	return queryOptions({
		queryKey: account("me"),
		queryFn: () => getMe(),
		staleTime: 60_000,
	});
}

// @ts-expect-error -- 2769: `retry` is an option of `retry()`, which this builder knows nothing of
queryOptions({ queryKey: account("me"), queryFn: getMe, retry: 1 });
// #endregion
