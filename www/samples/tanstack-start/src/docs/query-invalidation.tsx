import { action, invalidateMany, useQueryClient } from "@raf-query/react";

import { todos } from "~/queries.ts";

declare function addTodo(text: string): Promise<void>;

// #region action
const saveTodo = action(
	async (formData: FormData) => {
		await addTodo(String(formData.get("text")));
	},
	{ invalidates: [todos] },
);
// #endregion

function Example() {
	const qc = useQueryClient();
	return (
		// #region invalidating-from-mutations
		<form
			action={async (formData) => {
				await addTodo(String(formData.get("text")));
				await invalidateMany(qc, todos);
			}}
		>
			{/* ... */}
		</form>
	);
}
// #endregion

export { Example, saveTodo };
