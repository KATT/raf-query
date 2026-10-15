import { useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { use } from "react";

import { postQuery } from "~/queries.ts";

// #region a-taste
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => ({
		post: await args.context.queryClient.ensure(postQuery, {
			slug: args.params.slug,
		}),
	}),
	component: PostPage,
});

function PostPage() {
	const [postPromise, postState] = useQuery(
		postQuery,
		Route.useLoaderData().post,
	);
	const post = use(postPromise);
	return (
		<article aria-busy={postState.isFetching}>
			<h1>{post.title}</h1>
			<p>{post.body}</p>
		</article>
	);
}
// #endregion
