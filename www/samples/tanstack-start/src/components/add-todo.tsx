import { invalidateMany, useQueryClient } from "@raf-query/react";

import { createTodo } from "~/api.ts";
import { todos } from "~/queries.ts";

// #region add-todo
export function AddTodo() {
	const queryClient = useQueryClient();
	return (
		<form
			action={async (formData) => {
				await createTodo({ title: String(formData.get("title")) });
				await invalidateMany(queryClient, todos);
			}}
		>
			<input name="title" />
			<button>Add</button>
		</form>
	);
}
// #endregion
