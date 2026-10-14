/**
 * What the pages' `twoslash` code blocks import above `// ---cut---`: an
 * app's API and the factories the guides build on. Readers never see this
 * file, only the types it gives the blocks.
 */
/* oxlint-disable anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type -- stubs for Twoslash blocks; shape matters more than domain types */
import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
} from "@raf-query/react";
import type { ReactNode } from "react";

export interface Post {
	readonly authorId: string;
	readonly body: string;
	readonly slug: string;
	readonly title: string;
}

export interface PostComment {
	readonly author: string;
	readonly body: string;
	readonly id: string;
}

export interface CommentPage {
	readonly items: ReadonlyArray<PostComment>;
	readonly nextCursor: number | null;
}

export interface Todo {
	readonly done: boolean;
	readonly id: number;
	readonly title: string;
}

export interface Author {
	readonly id: string;
	readonly name: string;
}

export interface Build {
	readonly id: string;
	readonly status: "pending" | "running" | "done" | "failed";
}

export interface Org {
	readonly id: string;
	readonly name: string;
}

export declare function getPost(slug: string): Promise<Post>;

export declare function listComments(input: {
	readonly cursor: number;
	readonly slug: string;
}): Promise<CommentPage>;

export declare function fetchTodo(id: number): Promise<Todo>;

export declare function listTodos(input?: {
	readonly page?: number;
	readonly status?: "open" | "done";
}): Promise<ReadonlyArray<Todo>>;

export declare function getTodo(id: number): Promise<Todo>;

export declare function getSpecial(): Promise<unknown>;

export declare function fetchAllTodos(): Promise<ReadonlyArray<Todo>>;

export declare function fetchTodoById(id: number): Promise<Todo>;

export declare function getAuthor(id: string): Promise<Author>;

export declare function getBuild(id: string): Promise<Build>;

export declare function getCurrentOrg(): Promise<Org>;

export declare function getSettings(): Promise<{ readonly theme: string }>;

export declare function createTodo(input: {
	readonly title: string;
}): Promise<Todo>;

export declare function updatePost(input: {
	readonly slug: string;
	readonly title: string;
}): Promise<Post>;

export declare function updateTodo(input: {
	readonly done: boolean;
	readonly id: number;
}): Promise<Todo>;

export declare function searchPosts(input: {
	readonly q: string;
	readonly signal?: AbortSignal;
}): Promise<ReadonlyArray<Post>>;

/**
 * TanStack Router's `createFileRoute`, typed without an app's route tree:
 * the loader gets the router context and `$slug`, and `useLoaderData`
 * returns what the loader resolves to.
 */
export declare function createFileRoute(path: string): <
	TLoaderData,
	TSearch = Record<string, unknown>,
	TContext = { readonly queryClient: QueryClient },
>(options: {
	readonly beforeLoad?: (args: {
		readonly context: { readonly queryClient: QueryClient };
		readonly params: { readonly slug: string };
	}) => Promise<TContext> | TContext;
	readonly component?: () => ReactNode;
	readonly loader?: (args: {
		readonly context: { readonly queryClient: QueryClient };
		readonly deps: TSearch;
		readonly location?: { readonly search: TSearch };
		readonly params: { readonly slug: string };
		readonly search: TSearch;
	}) => Promise<TLoaderData> | TLoaderData;
	readonly loaderDeps?: (args: { readonly search: TSearch }) => TSearch;
	readonly pendingComponent?: () => ReactNode;
	readonly validateSearch?:
		| ((search: Record<string, unknown>) => TSearch)
		| { parse: (search: Record<string, unknown>) => TSearch };
}) => {
	useLoaderData(): TLoaderData;
	useRouteContext(): TContext;
	useSearch(): TSearch;
};

export declare function createRootRouteWithContext<_TContext>(): (options: {
	readonly component?: () => ReactNode;
}) => { readonly _: unique symbol };

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: () => getPost(input.slug),
		queryKey: ["post", input.slug],
		staleTime: 30_000,
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		getNextPageParam: (lastPage: CommentPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, slug: input.slug }),
		queryKey: ["comments", input.slug],
	});
}

export function authorQuery(input: { id: string }) {
	return queryOptions({
		queryFn: () => getAuthor(input.id),
		queryKey: ["author", input.id],
	});
}

export function todosQuery() {
	return queryOptions({
		queryFn: () => listTodos(),
		queryKey: ["todos"],
	});
}

export function filteredTodosQuery(input: {
	readonly page: number;
	readonly status: "open" | "done";
}) {
	return queryOptions({
		queryFn: () => listTodos(input),
		queryKey: ["todos", "list", input],
	});
}

export function todoQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () => fetchTodo(input.id),
		queryKey: ["todos", input.id],
	});
}

export function buildQuery(input: { id: string }) {
	return queryOptions({
		queryFn: () => getBuild(input.id),
		queryKey: ["build", input.id],
	});
}

export function currentOrgQuery() {
	return queryOptions({
		queryFn: () => getCurrentOrg(),
		queryKey: ["org", "current"],
	});
}

export function settingsQuery() {
	return queryOptions({
		queryFn: () => getSettings(),
		queryKey: ["settings"],
	});
}

export function searchQuery(input: { q: string }) {
	return queryOptions({
		queryFn: (context) => searchPosts({ q: input.q, signal: context.signal }),
		queryKey: ["search", input.q],
	});
}
