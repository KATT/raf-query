import { use } from "react";

import type { Todo } from "./api";

export function DoneTodos(props: {
	todosPromise: Promise<ReadonlyArray<Todo>>;
}) {
	// #region derive
	const todos = use(props.todosPromise);
	const done = todos.filter((todo) => todo.done);
	// #endregion
	return (
		<ul>
			{done.map((todo) => (
				<li key={todo.id}>{todo.title}</li>
			))}
		</ul>
	);
}
