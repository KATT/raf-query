import { ensureEntry, load, useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

import { postQuery } from "~/queries.ts";

// #region a-taste
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const [handles] = await load(args.context.queryClient, {
			post: ensureEntry(postQuery, { slug: args.params.slug }),
		});
		return handles;
	},
	component: PostPage,
});

function PostPage() {
	const [post, postState] = useQuery(postQuery, Route.useLoaderData().post);
	return (
		<article aria-busy={postState.isFetching}>
			<h1>{post.title}</h1>
			<p>{post.body}</p>
		</article>
	);
}
// #endregion
