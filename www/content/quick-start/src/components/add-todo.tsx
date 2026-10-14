import { useQueryClient } from "@raf-query/react";

import { createTodo } from "../api";
import { todosQuery } from "../queries";

// #region add-todo
export function AddTodo() {
	const qc = useQueryClient();
	return (
		<form
			action={async (formData) => {
				await createTodo({ title: String(formData.get("title")) });
				await qc.invalidate(todosQuery);
			}}
		>
			<input name="title" />
			<button>Add</button>
		</form>
	);
}
// #endregion
