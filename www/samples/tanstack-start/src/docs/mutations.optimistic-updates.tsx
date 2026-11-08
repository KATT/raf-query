import { invalidateMany, useQueryClient } from "@raf-query/react";
import { useActionState, useOptimistic } from "react";
import { todosQuery } from "~/queries.ts";

type Todo = { id: number; pending?: boolean; text: string };

declare function addTodoApi(text: string): Promise<void>;

// #region optimistic-updates
function AddTodo(props: { todos: Todo[] }) {
	const queryClient = useQueryClient();
	const [todos, addOptimistic] = useOptimistic(
		props.todos,
		(current, text: string) => [...current, { id: -1, pending: true, text }],
	);
	const [error, formAction] = useActionState(
		async (_previous: string | null, formData: FormData) => {
			const text = String(formData.get("text"));
			addOptimistic(text);
			try {
				await addTodoApi(text);
			} catch (error) {
				return error instanceof Error ? error.message : "Something went wrong";
			}
			await invalidateMany(queryClient, todosQuery);
			return null;
		},
		null,
	);
	// ...
}
// #endregion
