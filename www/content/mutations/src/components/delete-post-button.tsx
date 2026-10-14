import { useTransition } from "react";
import { queryOptions, useQueryClient } from "@raf-query/react";

declare function deletePost(slug: string): Promise<void>;

function postsQuery() {
	return queryOptions({
		queryKey: ["posts"],
		queryFn: async () => [] as Array<{ slug: string }>,
	});
}

// #region pending-delete
export function DeletePostButton(props: { slug: string }) {
	const qc = useQueryClient();
	const [isPending, startTransition] = useTransition();

	return (
		<button
			disabled={isPending}
			onClick={() => {
				startTransition(async () => {
					await deletePost(props.slug);
					await qc.invalidate(postsQuery);
				});
			}}
		>
			Delete
		</button>
	);
}
// #endregion
