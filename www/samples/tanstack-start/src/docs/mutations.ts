import {
	action,
	createQueryClient,
	getData,
	invalidateMany,
	invalidateOne,
	invalidateOnAction,
	type QueryClient,
	recommended,
	setData,
} from "@raf-query/react";
import { updatePost } from "~/api.ts";
import { postQuery, todosQuery } from "~/queries.ts";

// #region the-invalidateonaction-feature
const queryClient = createQueryClient({ features: [invalidateOnAction()] });
// or
const withEverything = createQueryClient({ ...recommended() });
// #endregion

// #region one-client-among-several
const widgetClient = createQueryClient({ features: [invalidateOnAction()] });
const savePost = action(updatePost, {
	client: widgetClient,
	invalidates: [postQuery],
});
// #endregion

declare const slug: string;

declare const title: string;

// #region invalidating-by-hand
await updatePost({ slug, title });
await invalidateOne(queryClient, postQuery, { slug });
// #endregion

declare function toggleTodoApi(id: number): Promise<void>;

// #region optimistic-updates-in-the-cache
async function toggleTodo(queryClient: QueryClient, id: number) {
	const previous = getData(queryClient, todosQuery);
	setData(queryClient, todosQuery, undefined, (data) => ({
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
		setData(
			queryClient,
			todosQuery,
			undefined,
			previous ?? { pageParams: [], pages: [] },
		);
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
