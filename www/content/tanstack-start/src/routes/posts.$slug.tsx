import { useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

import { commentsQuery, postQuery } from "../queries";

export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const comments = qc.prefetch(commentsQuery, { slug: args.params.slug });
		const post = await qc.ensure(postQuery, { slug: args.params.slug });
		return { comments, post };
	},
	component: PostPage,
});

function PostPage() {
	const loaderData = Route.useLoaderData();
	const [post] = useQuery(postQuery, loaderData.post);
	return <h1>{post.title}</h1>;
}
