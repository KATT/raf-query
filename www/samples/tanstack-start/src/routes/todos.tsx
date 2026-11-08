// #region loader
import {
	load,
	prefetch,
	type QueryHandle,
	useInfiniteQuery,
} from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";

import { todosQuery } from "~/queries.ts";

export const Route = createFileRoute("/todos")({
	loader: async (args) => {
		const [handles] = await load(args.context.queryClient, {
			todos: prefetch(todosQuery),
		});
		return handles;
	},
	component: TodosPage,
});
// #endregion

// #region component
function TodosPage() {
	const loaderData = Route.useLoaderData();
	return (
		<Suspense fallback={<p>Loading…</p>}>
			<TodoList handle={loaderData.todos} />
		</Suspense>
	);
}

function TodoList(props: { handle: QueryHandle<typeof todosQuery> }) {
	const [pagesThenable, todosState] = useInfiniteQuery(
		todosQuery,
		props.handle,
	);
	const pages = use(pagesThenable);
	return (
		<ul aria-busy={todosState.isFetching}>
			{pages.pages
				.flatMap((page) => page.items)
				.map((todo) => (
					<li key={todo.id}>{todo.title}</li>
				))}
		</ul>
	);
}
// #endregion
