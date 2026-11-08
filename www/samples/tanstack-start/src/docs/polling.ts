import {
	createQueryClient,
	polling,
	queryOptions,
	recommended,
} from "@raf-query/react";
import { getCommentCount, getPostViews } from "~/api.ts";
import { posts } from "~/queries.ts";

// #region intro
export function postViewsQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("views", input.slug),
		queryFn: () => getPostViews(input.slug),
		meta: { refetchInterval: 2000 },
	});
}
// #endregion

// #region the-feature
const queryClient = createQueryClient({ features: [polling()] });
// or
const sameWithMore = createQueryClient({ ...recommended() });
// #endregion

// #region the-interval-per-input
export function commentCountQuery(input: { slug: string; live: boolean }) {
	return queryOptions({
		queryKey: posts("commentCount", input),
		queryFn: () => getCommentCount(input.slug),
		meta: { refetchInterval: input.live ? 1000 : false },
	});
}
// #endregion
