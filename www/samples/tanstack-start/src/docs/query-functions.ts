import { type ErrorOf, fail, group, queryOptions } from "@raf-query/react";
import type { Post, Todo } from "~/api.ts";

const todos = group("todos");
const posts = group("posts");
const builds = group("builds");

declare function fetchAllTodos(): Promise<ReadonlyArray<Todo>>;

declare function fetchTodoById(id: number): Promise<Todo>;

declare const id: number;

// #region intro
queryOptions({ queryKey: todos(), queryFn: fetchAllTodos });
queryOptions({ queryKey: todos(id), queryFn: () => fetchTodoById(id) });
queryOptions({
	queryKey: todos(id),
	queryFn: async () => {
		const data = await fetchTodoById(id);
		return data;
	},
});
queryOptions({
	queryKey: todos(id),
	queryFn: (context) => fetchTodoById(context.queryKey[1]),
});
// #endregion

declare const somethingGoesWrong: boolean;

declare const somethingElseGoesWrong: boolean;

declare const data: unknown;

// #region handling-and-throwing-errors
queryOptions({
	queryKey: todos(id),
	queryFn: async () => {
		if (somethingGoesWrong) {
			throw new Error("Oh no!");
		}
		if (somethingElseGoesWrong) {
			return Promise.reject(new Error("Oh no!"));
		}
		return data;
	},
});
// #endregion

// #region expected-errors
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts(input.slug),
		queryFn: async (context) => {
			const response = await fetch(`/api/posts/${input.slug}`, {
				signal: context.signal,
			});
			if (response.status === 404) {
				return fail({ _tag: "NotFound", slug: input.slug });
			}
			if (!response.ok) {
				throw new Error(`Request failed: ${response.status}`);
			}
			return (await response.json()) as Post;
		},
	});
}

type PostError = ErrorOf<typeof postQuery>;
//   ^?
// #endregion

// #region with-fetch-and-other-clients-that-dont-throw
queryOptions({
	queryKey: todos(id),
	queryFn: async (context) => {
		const response = await fetch(`/todos/${id}`, { signal: context.signal });
		if (!response.ok) {
			throw new Error(`Request failed: ${response.status}`);
		}
		return response.json();
	},
});
// #endregion

declare function streamLines(signal: AbortSignal): AsyncIterable<string>;

// #region streaming
export function logQuery(input: { buildId: string }) {
	return queryOptions({
		queryKey: builds("log", input),
		queryFn: (context) => streamLines(context.signal),
		stream: {
			initial: [] as ReadonlyArray<string>,
			reduce: (lines, line) => [...lines, line],
		},
	});
}
// #endregion
