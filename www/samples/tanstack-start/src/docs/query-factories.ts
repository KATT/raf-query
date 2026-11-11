import { getPost, listComments } from "~/api.ts";

// #region intro
import { group } from "@raf-query/react";

import { infiniteQueryOptions, queryOptions } from "~/raf.ts";

export const posts = group("posts");

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("bySlug", input.slug),
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: posts("comments", input.slug),
		queryFn: (context) =>
			listComments({ slug: input.slug, cursor: context.pageParam }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
// #endregion
