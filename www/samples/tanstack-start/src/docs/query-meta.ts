declare function listIssues(): Promise<unknown>;

declare const toast: { error(message: string): void };

declare module "@raf-query/react" {
	interface Register {
		queryMeta: { errorMessage?: string; scope?: string };
	}
}

// #region intro
import { Query, QueryClient, queryOptions } from "@raf-query/react";

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
