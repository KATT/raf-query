import {
	type EnsuredQueryHandle,
	type InputOf,
	infiniteQueryOptions,
	type QueryHandle,
	type QueryKey,
	queryOptions,
} from "@raf-query/react";

import { getPost, listComments } from "./api";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: ["comments", input.slug],
		queryFn: (context) =>
			listComments({ slug: input.slug, cursor: context.pageParam }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}

// #region types
type Handle = QueryHandle<typeof postQuery>;
//   ^?
// { key: QueryKey; input: { slug: string }; ensured: false }

type Ensured = EnsuredQueryHandle<typeof postQuery>;
//   ^?
// { key: QueryKey; input: { slug: string }; ensured: true }

type PostInput = InputOf<typeof postQuery>; // { slug: string }
type PostKey = QueryKey; // readonly unknown[]
// #endregion

export type { Ensured, Handle, PostInput, PostKey };
