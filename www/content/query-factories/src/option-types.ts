import type { InfiniteQueryOptions, QueryOptions } from "@raf-query/react";

import { type CommentPage, type Post } from "./api";
import { commentsQuery, postQuery } from "./queries";

// #region options
const post: QueryOptions<{ data: Post }> = postQuery({ slug: "hello-world" });
const comments: InfiniteQueryOptions<{ page: CommentPage; pageParam: number }> =
	commentsQuery({ slug: "hello-world" });
// #endregion

export { comments, post };
