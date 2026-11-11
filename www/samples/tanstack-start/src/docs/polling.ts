import { createQueryClient, polling, recommended } from "@raf-query/react";
import { getCommentCount, getPostViews } from "~/api.ts";
import { posts } from "~/queries.ts";

// #region intro
import { queryOptions } from "~/raf.ts";

export function postViewsQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("views", input.slug),
		queryFn: () => getPostViews(input.slug),
		refetchInterval: 2000,
	});
}
// #endregion

// #region the-feature
const queryClient = createQueryClient({ parts: [polling()] });
// or
const sameWithMore = createQueryClient({ parts: recommended() });
// #endregion

// #region the-interval-per-input
export function commentCountQuery(input: { slug: string; live: boolean }) {
	return queryOptions({
		queryKey: posts("commentCount", input),
		queryFn: () => getCommentCount(input.slug),
		refetchInterval: input.live ? 1000 : false,
	});
}
// #endregion
