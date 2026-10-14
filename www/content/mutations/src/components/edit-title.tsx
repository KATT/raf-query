import { useOptimistic } from "react";
import { useQueryClient } from "@raf-query/react";

import { updatePost } from "../api";
import type { Post } from "../api";
import { postQuery } from "../queries";

// #region edit-title
export function EditTitle(props: { post: Post }) {
	const qc = useQueryClient();
	const [title, setOptimisticTitle] = useOptimistic(props.post.title);

	return (
		<form
			action={async (formData) => {
				const next = String(formData.get("title"));
				setOptimisticTitle(next);
				await updatePost({ slug: props.post.slug, title: next });
				await qc.invalidate(postQuery, { slug: props.post.slug });
			}}
		>
			<input defaultValue={title} name="title" />
		</form>
	);
}
// #endregion
