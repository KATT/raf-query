import { useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, startTransition } from "react";

import { Comments, CommentsSkeleton } from "../components/comments";
import { commentsQuery, postQuery } from "../queries";

export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const comments = qc.prefetch(commentsQuery, { slug: args.params.slug });
		const post = await qc.ensure(postQuery, { slug: args.params.slug });
		return { post, comments };
	},
	component: PostPage,
});

// #region page
function PostPage() {
	const loaderData = Route.useLoaderData();
	// `post` came from `qc.ensure`, `comments` from `qc.prefetch`.
	const [post, postState] = useQuery(postQuery, loaderData.post);

	return (
		<article>
			<h1>{post.title}</h1>
			<button
				disabled={postState.isFetching}
				onClick={() => startTransition(() => postState.refetch())}
			>
				Refresh
			</button>
			<p>{post.body}</p>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={loaderData.comments} />
			</Suspense>
		</article>
	);
}
// #endregion
