import { invalidateMany, invalidateOne } from "@raf-query/react";
import { useQueryClient } from "~/raf.ts";
import { useOptimistic, useTransition } from "react";
import { type Post, updatePost } from "~/api.ts";
import { authors, postQuery, postsQuery } from "~/queries.ts";

// #region intro
function EditTitle(props: { post: Post }) {
	const queryClient = useQueryClient();
	const [title, setOptimisticTitle] = useOptimistic(props.post.title);

	return (
		<form
			action={async (formData) => {
				const next = String(formData.get("title"));
				setOptimisticTitle(next);
				await updatePost({ slug: props.post.slug, title: next });
				await invalidateOne(queryClient, postQuery, { slug: props.post.slug });
			}}
		>
			<input name="title" defaultValue={title} />
		</form>
	);
}
// #endregion

declare function deletePostApi(slug: string): Promise<void>;

function DeleteButton(props: { slug: string }) {
	// #region pending-state
	const queryClient = useQueryClient();
	const [isPending, startTransition] = useTransition();

	return (
		<button
			disabled={isPending}
			onClick={() => {
				startTransition(async () => {
					await deletePostApi(props.slug);
					// The post lists, and the authors' post counts
					await invalidateMany(queryClient, [postsQuery, authors]);
				});
			}}
		>
			Delete
		</button>
	);
	// #endregion
}

export { DeleteButton, EditTitle };
