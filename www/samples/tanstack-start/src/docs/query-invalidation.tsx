import { invalidateMany, useQueryClient } from "@raf-query/react";

import { addComment } from "~/api.ts";
import { comments } from "~/queries.ts";

function Example(props: { slug: string }) {
	const qc = useQueryClient();
	return (
		// #region invalidating-from-mutations
		<form
			action={async (formData) => {
				await addComment({
					body: String(formData.get("body")),
					slug: props.slug,
				});
				await invalidateMany(qc, comments);
			}}
		>
			{/* ... */}
		</form>
	);
}
// #endregion

export { Example };
