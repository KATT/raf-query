import { createFileRoute } from "@tanstack/react-router";

import { commentsQuery, postQuery } from "../queries";

function PostPage() {
	return null;
}

// #region loader
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const comments = qc.prefetch(commentsQuery, { slug: args.params.slug });
		const post = await qc.ensure(postQuery, { slug: args.params.slug });
		return { post, comments };
	},
	component: PostPage,
});
// #endregion
