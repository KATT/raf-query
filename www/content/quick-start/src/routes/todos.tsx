import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense, use } from "react";

import { createFileRoute } from "../../../_twoslash.ts";
import { todosQuery } from "../queries.ts";

// #region loader
export const Route = createFileRoute("/todos")({
	loader: (args) => ({
		todos: args.context.queryClient.prefetch(todosQuery),
	}),
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
	const [todosPromise, todosState] = useQuery(todosQuery, props.handle);
	const todos = use(todosPromise);
	return (
		<ul aria-busy={todosState.isFetching}>
			{todos.map((todo) => (
				<li key={todo.id}>{todo.title}</li>
			))}
		</ul>
	);
}
// #endregion
