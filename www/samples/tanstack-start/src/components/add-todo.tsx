import { action } from "@raf-query/react";

import { createTodo } from "~/api.ts";
import { todos } from "~/queries.ts";

// #region add-todo
const addTodo = action(
	async (formData: FormData) => {
		await createTodo({ title: String(formData.get("title")) });
	},
	{ invalidates: [todos] },
);

export function AddTodo() {
	return (
		<form action={addTodo}>
			<input name="title" />
			<button>Add</button>
		</form>
	);
}
// #endregion
