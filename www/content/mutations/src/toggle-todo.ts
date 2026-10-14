import { QueryClient } from "@raf-query/react";

import { toggleTodoApi } from "./api";
import { todosQuery } from "./queries";

const qc = new QueryClient();
const api = { toggleTodo: toggleTodoApi };

// #region optimistic-cache
export async function toggleTodo(id: number) {
	const previous = qc.getData(todosQuery);
	qc.setData(todosQuery, undefined, (todos) =>
		(todos ?? []).map((todo) =>
			todo.id === id ? { ...todo, done: !todo.done } : todo,
		),
	);
	try {
		await api.toggleTodo(id);
	} catch (error) {
		qc.setData(todosQuery, undefined, previous ?? []);
		throw error;
	} finally {
		await qc.invalidate(todosQuery);
	}
}
// #endregion
