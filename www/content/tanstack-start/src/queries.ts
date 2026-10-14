import { queryOptions } from "@raf-query/react";

import { getMe, listComments } from "./api";
import { getPost } from "./posts.functions";

// #region post-query
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost({ data: input }),
	});
}
// #endregion

export function commentsQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["comments", input.slug],
		queryFn: () => listComments(input.slug),
	});
}

export function meQuery() {
	return queryOptions({
		queryKey: ["me"],
		queryFn: getMe,
	});
}
