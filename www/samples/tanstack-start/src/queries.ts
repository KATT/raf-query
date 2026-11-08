// #region home
import { group, infiniteQueryOptions, queryOptions } from "@raf-query/react";

import { type CommentPage, listComments } from "./api.ts";
import { getPost } from "./posts.functions.ts";

// #endregion home
import {
	getAuthor,
	getBuild,
	getMe,
	getSettings,
	getTodo,
	listPosts,
	listTodos,
} from "./api.ts";

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

export const todos = group("todos");

export function todosQuery() {
	return queryOptions({
		queryKey: todos("list"),
		queryFn: () => listTodos(),
	});
}

export function todoQuery(input: { id: number }) {
	return queryOptions({
		queryKey: todos("byId", input.id),
		queryFn: () => getTodo(input.id),
		staleTime: 30_000,
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

export const builds = group("builds");

export function buildQuery(input: { id: string }) {
	return queryOptions({
		queryKey: builds(input.id),
		queryFn: () => getBuild(input.id),
	});
}

export function settingsQuery() {
	return queryOptions({
		queryKey: account("settings"),
		queryFn: () => getSettings(),
	});
}
