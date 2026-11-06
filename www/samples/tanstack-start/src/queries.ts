// #region todos
// #region home
import { infiniteQueryOptions, queryOptions } from "@raf-query/react";
import { group } from "@raf-query/react/groups";

// #endregion home
import { getTodo, listTodos } from "./api.ts";

// #endregion todos
// #region home
import { type CommentPage, listComments } from "./api.ts";
import { getPost } from "./posts.functions.ts";

// #endregion home
import { getAuthor, getBuild, getMe, getSettings, listPosts } from "./api.ts";

// #region todos
export const todos = group("todos");

export function todosQuery() {
	return infiniteQueryOptions({
		queryKey: [todos, "list"],
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
		queryKey: [todos, "byId", input.id],
		queryFn: () => getTodo(input.id),
		staleTime: 30_000,
	});
}
// #endregion todos

// #region home
// #region groups
export const posts = group("posts");
// A post's comments are a group inside `posts`.
export const comments = group("comments", posts);
// #endregion groups

// #region post-query
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: [posts, "bySlug", input.slug],
		queryFn: () => getPost({ data: input }),
	});
}
// #endregion post-query

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: [comments, input.slug],
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, slug: input.slug }),
		initialPageParam: 0,
		getNextPageParam: (lastPage: CommentPage) => lastPage.nextCursor,
	});
}
// #endregion home

export function postsQuery(input: { page: number; sort: "newest" | "oldest" }) {
	return queryOptions({
		queryKey: [posts, "list", input],
		queryFn: () => listPosts(input),
	});
}

export const authors = group("authors");

export function authorQuery(input: { id: string }) {
	return queryOptions({
		queryKey: [authors, input.id],
		queryFn: () => getAuthor(input.id),
	});
}

export const account = group("account");

export function meQuery() {
	return queryOptions({
		queryKey: [account, "me"],
		queryFn: () => getMe(),
	});
}

export const builds = group("builds");

export function buildQuery(input: { id: string }) {
	return queryOptions({
		queryKey: [builds, input.id],
		queryFn: () => getBuild(input.id),
	});
}

export function settingsQuery() {
	return queryOptions({
		queryKey: [account, "settings"],
		queryFn: () => getSettings(),
	});
}
