import { getPost, listComments } from "~/api.ts";
import { comments, posts } from "~/queries.ts";

import type { makeQueryClient } from "./query-meta.ts";

// #region bind
import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	bindUseQueryClient,
} from "@raf-query/react";

// `makeQueryClient` is the function above, imported with `import type`.
type Client = typeof makeQueryClient;

export const queryOptions = bindQueryOptions<Client>();
export const useQueryClient = bindUseQueryClient<Client>();
// Only in an app that pages:
export const infiniteQueryOptions = bindInfiniteQueryOptions<Client>();
// #endregion

// #region bound
export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: comments(input.slug),
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, slug: input.slug }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		meta: {
			errorMessage: "Couldn't load the comments",
			owner: "community",
			retry: 1,
		},
	});
}
// #endregion

// #region bound-errors
queryOptions({
	queryKey: posts("bySlug", "hello-world"),
	queryFn: () => getPost("hello-world"),
	// @ts-expect-error -- 2769: no link or feature of the root reads `cacheFor`
	meta: { cacheFor: 60_000 },
});
// #endregion

// #region use-query-client
import { invalidateMany } from "@raf-query/react";

export function RefreshComments(props: { slug: string }) {
	const client = useQueryClient();
	return (
		<button
			onClick={() => invalidateMany(client, commentsQuery, props)}
			type="button"
		>
			Refresh
		</button>
	);
}
// #endregion
