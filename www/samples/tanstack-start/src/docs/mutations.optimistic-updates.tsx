import { invalidateMany } from "@raf-query/react";
import { useQueryClient } from "~/raf.ts";
import { useActionState, useOptimistic } from "react";
import { addComment, type PostComment } from "~/api.ts";
import { commentsQuery } from "~/queries.ts";

type ShownComment = PostComment & { pending?: boolean };

// #region optimistic-updates
function AddComment(props: {
	comments: ReadonlyArray<ShownComment>;
	slug: string;
}) {
	const queryClient = useQueryClient();
	// Newest first: the new comment shows at the top, marked as saving.
	const [comments, addOptimistic] = useOptimistic(
		props.comments,
		(current, body: string) => [
			{ author: "You", body, id: "new", pending: true },
			...current,
		],
	);
	const [error, formAction] = useActionState(
		async (_previous: string | null, formData: FormData) => {
			const body = String(formData.get("body"));
			addOptimistic(body);
			try {
				await addComment({ body, slug: props.slug });
			} catch (error) {
				return error instanceof Error ? error.message : "Something went wrong";
			}
			await invalidateMany(queryClient, [
				[commentsQuery, { slug: props.slug }],
			]);
			return null;
		},
		null,
	);
	// ...
}
// #endregion
