// #region todos
import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

import { getTodo, listTodos } from "./api.ts";

// #endregion
import {
	type CommentPage,
	getAuthor,
	getBuild,
	getMe,
	getSettings,
	listComments,
	listPosts,
} from "./api.ts";
import { getPost } from "./posts.functions.ts";

// #region todos
export function todosQuery() {
	return infiniteQueryOptions({
		queryKey: ["todos"],
		queryFn: async () => ({
			items: await listTodos(),
			nextCursor: null,
		}),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}

export function todoQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["todos", input.id],
		queryFn: () => getTodo(input.id),
		staleTime: 30_000,
	});
}
// #endregion

// #region post-query
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost({ data: input }),
	});
}
// #endregion

export function postsQuery(input: { page: number; sort: "newest" | "oldest" }) {
	return queryOptions({
		queryKey: ["posts", input],
		queryFn: () => listPosts(input),
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: ["comments", input.slug],
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, slug: input.slug }),
		initialPageParam: 0,
		getNextPageParam: (lastPage: CommentPage) => lastPage.nextCursor,
	});
}

export function authorQuery(input: { id: string }) {
	return queryOptions({
		queryKey: ["author", input.id],
		queryFn: () => getAuthor(input.id),
	});
}

export function meQuery() {
	return queryOptions({
		queryKey: ["me"],
		queryFn: () => getMe(),
	});
}

export function buildQuery(input: { id: string }) {
	return queryOptions({
		queryKey: ["build", input.id],
		queryFn: () => getBuild(input.id),
	});
}

export function settingsQuery() {
	return queryOptions({
		queryKey: ["settings"],
		queryFn: () => getSettings(),
	});
}
