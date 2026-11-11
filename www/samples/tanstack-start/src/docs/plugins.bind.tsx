import { getAuthor, getMe } from "~/api.ts";
import { account, authors, comments, posts } from "~/queries.ts";

import type { makeQueryClient } from "./plugins.ts";

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
		// `api` is the context the `api()` plugin gives
		queryFn: ({ api, pageParam, signal }) =>
			api.listComments({ cursor: pageParam, slug: input.slug }, { signal }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		// Options the client's plugins declare
		errorMessage: "Couldn't load the comments",
		owner: "community",
		retry: 1,
	});
}
// #endregion

// #region bound-errors
// @ts-expect-error -- 2769: no plugin of the client declares `cacheFor`
queryOptions({ queryKey: account("me"), queryFn: getMe, cacheFor: 60_000 });
// #endregion

// #region context
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("bySlug", input.slug),
		queryFn: ({ api, signal }) => api.getPost(input.slug, { signal }),
	});
}
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

// #region client-type
import type { ClientFor } from "@raf-query/react";

// The app's client
type AppQueryClient = ReturnType<typeof makeQueryClient>;

// Any client that can run `commentsQuery`
type CommentsClient = ClientFor<typeof commentsQuery>;

export function refreshComments(client: CommentsClient, slug: string) {
	return invalidateMany(client, commentsQuery, { slug });
}
// #endregion

// #region options-of
import type { OptionsOf } from "@raf-query/react";

// For data that doesn't change: never stale, and not worth a retry
const pinned = {
	retry: false,
	staleTime: Infinity,
} satisfies OptionsOf<typeof makeQueryClient>;

export function authorQuery(input: { id: string }) {
	return queryOptions({
		...pinned,
		queryKey: authors(input.id),
		queryFn: () => getAuthor(input.id),
	});
}
// #endregion
