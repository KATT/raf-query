// #region home
import { group } from "@raf-query/react";

import { type CommentPage, listComments } from "./api.ts";
import { getPost } from "./posts.functions.ts";
import { infiniteQueryOptions, queryOptions } from "./raf.ts";

// #endregion home
import { getAuthor, getMe, listPostPage, listPosts } from "./api.ts";

// #region home
// #region groups
export const posts = group("posts");
// A post's comments are a group inside `posts`.
export const comments = group(posts, "comments");
// #endregion groups

// #region post-query
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("bySlug", input.slug),
		queryFn: () => getPost({ data: input }),
	});
}
// #endregion post-query

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: comments(input.slug),
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, slug: input.slug }),
		initialPageParam: 0,
		getNextPageParam: (lastPage: CommentPage) => lastPage.nextCursor,
	});
}
// #endregion home

export function feedQuery() {
	return infiniteQueryOptions({
		queryKey: posts("feed"),
		queryFn: (context) => listPostPage({ cursor: context.pageParam }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}

export function postsQuery(input: { page: number; sort: "newest" | "oldest" }) {
	return queryOptions({
		queryKey: posts("list", input),
		queryFn: () => listPosts(input),
	});
}

export const authors = group("authors");

export function authorQuery(input: { id: string }) {
	return queryOptions({
		queryKey: authors(input.id),
		queryFn: () => getAuthor(input.id),
	});
}

export const account = group("account");

export function meQuery() {
	return queryOptions({
		queryKey: account("me"),
		queryFn: () => getMe(),
	});
}
