import { use } from "react";
import { load, swr, useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

import { postQuery } from "~/queries.ts";

// #region a-taste
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const [handles] = await load(args.context.queryClient, {
			post: swr(postQuery, { slug: args.params.slug }),
		});
		return handles;
	},
	component: PostPage,
});

function PostPage() {
	const [postThenable, postState] = useQuery(
		postQuery,
		Route.useLoaderData().post,
	);
	const post = use(postThenable);
	return (
		<article aria-busy={postState.isFetching}>
			<h1>{post.title}</h1>
			<p>{post.body}</p>
		</article>
	);
}
// #endregion
