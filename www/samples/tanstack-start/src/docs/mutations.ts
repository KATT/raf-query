import {
	getData,
	invalidateMany,
	type QueryClient,
	setData,
} from "@raf-query/react";
import { updatePost } from "~/api.ts";
import { authors, postQuery, postsQuery, todosQuery } from "~/queries.ts";

declare const queryClient: QueryClient;

declare const slug: string;

declare const title: string;

// #region several-targets
await updatePost({ slug, title });
await invalidateMany(queryClient, [
	[postQuery, slug], // this post
	postsQuery, // every post list
	authors, // and the authors' post counts
]);
// #endregion

declare function toggleTodoApi(id: number): Promise<void>;

// #region optimistic-updates-in-the-cache
async function toggleTodo(queryClient: QueryClient, id: number) {
	const previous = getData(queryClient, todosQuery);
	setData(queryClient, todosQuery, (data) => ({
		pageParams: data?.pageParams ?? [],
		pages: (data?.pages ?? []).map((page) => ({
			...page,
			items: page.items.map((todo) =>
				todo.id === id ? { ...todo, done: !todo.done } : todo,
			),
		})),
	}));
	try {
		await toggleTodoApi(id);
	} catch (error) {
		setData(queryClient, todosQuery, previous ?? { pageParams: [], pages: [] });
		throw error;
	} finally {
		await invalidateMany(queryClient, todosQuery);
	}
}
// #endregion

// #region updates-from-mutation-responses
const updated = await updatePost({ slug, title });
setData(queryClient, postQuery, { slug }, updated);
// #endregion
