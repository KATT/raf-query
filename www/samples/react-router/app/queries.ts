// #region home
import { group } from "@raf-query/react";

import { getPost, listComments } from "./api.ts";
import { infiniteQueryOptions, queryOptions } from "./raf.ts";

const post = group("post");
const comments = group("comments");

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: post(input.slug),
		queryFn: () => getPost(input.slug),
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: comments(input.slug),
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, slug: input.slug }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
// #endregion home

import { listPosts } from "./api.ts";
import type { PostsInput } from "./posts-input.ts";

const posts = group("posts");

export function postsQuery(input: PostsInput) {
	return queryOptions({
		queryKey: posts("list", input),
		queryFn: () => listPosts(input),
	});
}
