import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

import {
	type CommentPage,
	getAuthor,
	getBuild,
	getPost,
	getSettings,
	listComments,
	listPosts,
	listTodos,
} from "./api.ts";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
	});
}

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

export function todosQuery() {
	return queryOptions({
		queryKey: ["todos"],
		queryFn: () => listTodos(),
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
