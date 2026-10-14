import { useQueryClient } from "@raf-query/react";

import { addTodo } from "../api";

// #region invalidate-form
export function AddTodoForm() {
	const qc = useQueryClient();
	return (
		<form
			action={async (formData) => {
				await addTodo(String(formData.get("text")));
				await qc.invalidate({ queryKey: ["todos"] });
			}}
		>
			{/* ... */}
		</form>
	);
}
// #endregion
