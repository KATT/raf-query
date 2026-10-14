import { createFileRoute } from "@tanstack/react-router";

import { commentsQuery, postQuery } from "../queries";

function PostPage() {
	return null;
}

export async function postSlugLoader(args: {
	context: { queryClient: import("@raf-query/react").QueryClient };
	params: { slug: string };
}) {
	const qc = args.context.queryClient;
	const comments = qc.prefetch(commentsQuery, { slug: args.params.slug });
	const post = await qc.ensure(postQuery, { slug: args.params.slug });
	return { comments, post };
}

export const Route = createFileRoute("/posts/$slug")({
	loader: postSlugLoader,
	component: PostPage,
});
