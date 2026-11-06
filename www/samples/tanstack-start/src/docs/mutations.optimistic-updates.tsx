import { action } from "@raf-query/react";
import { useActionState, useOptimistic } from "react";
import { todosQuery } from "~/queries.ts";

type Todo = { id: number; pending?: boolean; text: string };

declare function addTodoApi(text: string): Promise<void>;

// #region optimistic-updates
const addTodo = action(addTodoApi, { invalidates: [todosQuery] });

function AddTodo(props: { todos: Todo[] }) {
	const [todos, addOptimistic] = useOptimistic(
		props.todos,
		(current, text: string) => [...current, { id: -1, pending: true, text }],
	);
	const [error, formAction] = useActionState(
		async (_previous: string | null, formData: FormData) => {
			const text = String(formData.get("text"));
			addOptimistic(text);
			try {
				await addTodo(text);
			} catch (error) {
				return error instanceof Error ? error.message : "Something went wrong";
			}
			return null;
		},
		null,
	);
	// ...
}
// #endregion
