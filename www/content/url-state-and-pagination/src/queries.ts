import { queryOptions } from "@raf-query/react";

import { listPosts, type Post } from "./api";

export function postsQuery(input: { page: number; sort: "newest" | "oldest" }) {
	return queryOptions({
		queryKey: ["posts", input],
		queryFn: () => listPosts(input),
	});
}

export type { Post };
