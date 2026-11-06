import { action } from "@raf-query/react";
import { useOptimistic, useTransition } from "react";
import { type Post, updatePost } from "~/api.ts";
import { postQuery, postsQuery } from "~/queries.ts";

// #region intro
const savePost = action(updatePost, { invalidates: [postQuery] });

function EditTitle(props: { post: Post }) {
	const [title, setOptimisticTitle] = useOptimistic(props.post.title);

	return (
		<form
			action={async (formData) => {
				const next = String(formData.get("title"));
				setOptimisticTitle(next);
				await savePost({ slug: props.post.slug, title: next });
			}}
		>
			<input name="title" defaultValue={title} />
		</form>
	);
}
// #endregion

declare function deletePostApi(slug: string): Promise<void>;

const deletePost = action(deletePostApi, { invalidates: [postsQuery] });

declare const props: { slug: string };

// #region pending-state
const [isPending, startTransition] = useTransition();

<button
	disabled={isPending}
	onClick={() => {
		startTransition(async () => {
			await deletePost(props.slug);
		});
	}}
>
	Delete
</button>;
// #endregion
