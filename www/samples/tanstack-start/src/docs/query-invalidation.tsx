import { invalidateMany, useQueryClient } from "@raf-query/react";

import { todos } from "~/queries.ts";

declare function addTodo(text: string): Promise<void>;

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

export { Example };
