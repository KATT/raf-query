/* oxlint-disable no-unused-expressions -- `commentsOptions` is shown for Twoslash */
import { infiniteQueryOptions } from "@raf-query/react";

import { type CommentPage, listComments } from "./api";

// #region inference
const commentsOptions = infiniteQueryOptions({
	getNextPageParam: (lastPage: CommentPage) => lastPage.nextCursor,
	initialPageParam: 0,
	queryFn: (context) =>
		listComments({ cursor: context.pageParam, slug: "hello-world" }),
	queryKey: ["comments", "hello-world"],
});
commentsOptions;
// ^?
// #endregion

export { commentsOptions };
