import { Query, QueryClient, queryOptions } from "@raf-query/react";

import { listIssues } from "./api";
import "./register";
import { toast } from "./toast";

// #region setup
export function issuesQuery() {
	return queryOptions({
		queryKey: ["issues"],
		queryFn: () => listIssues(),
		meta: { errorMessage: "Couldn't load issues" },
	});
}

const queryClient = new QueryClient({
	onError: (error, query) => {
		toast.error(
			Query.metaUnsafe(query)?.errorMessage ?? "Something went wrong",
		);
	},
});
// #endregion

export { queryClient };
