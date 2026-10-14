/**
 * What the pages' `twoslash` code blocks import above `// ---cut---`: an
 * app's API and the factories the guides build on. Readers never see this
 * file, only the types it gives the blocks.
 */
import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
} from "@raf-query/react";
import type { ReactNode } from "react";

export interface Post {
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

export declare function getPost(slug: string): Promise<Post>;

export declare function listComments(input: {
	readonly cursor: number;
	readonly slug: string;
}): Promise<CommentPage>;

export declare function fetchTodo(id: number): Promise<Todo>;

/**
 * TanStack Router's `createFileRoute`, typed without an app's route tree:
 * the loader gets the router context and `$slug`, and `useLoaderData`
 * returns what the loader resolves to.
 */
export declare function createFileRoute(
	path: string,
): <TLoaderData>(options: {
	readonly component: () => ReactNode;
	readonly loader: (args: {
		readonly context: { readonly queryClient: QueryClient };
		readonly params: { readonly slug: string };
	}) => Promise<TLoaderData> | TLoaderData;
}) => { useLoaderData(): TLoaderData };

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: () => getPost(input.slug),
		queryKey: ["post", input.slug],
		staleTime: 30_000,
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions<CommentPage, number>({
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, slug: input.slug }),
		queryKey: ["comments", input.slug],
	});
}
