import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

import {
	type CommentPage,
	getAuthor,
	getBuild,
	getCurrentOrg,
	getPost,
	getSettings,
	getTodo,
	listComments,
	listTodos,
	searchPosts,
} from "./api.ts";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
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

export function filteredTodosQuery(input: {
	readonly page: number;
	readonly status: "open" | "done";
}) {
	return queryOptions({
		queryKey: ["todos", "list", input],
		queryFn: () => listTodos(input),
	});
}

export function todoQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["todos", input.id],
		queryFn: () => getTodo(input.id),
	});
}

export function buildQuery(input: { id: string }) {
	return queryOptions({
		queryKey: ["build", input.id],
		queryFn: () => getBuild(input.id),
	});
}

export function currentOrgQuery() {
	return queryOptions({
		queryKey: ["org", "current"],
		queryFn: () => getCurrentOrg(),
	});
}

export function settingsQuery() {
	return queryOptions({
		queryKey: ["settings"],
		queryFn: () => getSettings(),
	});
}

export function searchQuery(input: { q: string }) {
	return queryOptions({
		queryKey: ["search", input.q],
		queryFn: (context) => searchPosts({ q: input.q, signal: context.signal }),
	});
}
