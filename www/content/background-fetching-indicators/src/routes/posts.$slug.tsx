import {
	type EnsuredQueryHandle,
	useIsFetching,
	useQuery,
} from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

import { Spinner } from "../components/spinner";
import { postQuery } from "../queries";

export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => ({
		post: await args.context.queryClient.ensure(postQuery, {
			slug: args.params.slug,
		}),
	}),
	component: PostPage,
});

function PostPage() {
	const loaderData = Route.useLoaderData();
	// #region filter
	const savingComments = useIsFetching({ queryKey: ["comments"] });
	// #endregion
	return (
		<>
			<Post handle={loaderData.post} />
			{savingComments > 0 ? <p>Saving comments…</p> : null}
		</>
	);
}

// #region post
function Post(props: { handle: EnsuredQueryHandle<typeof postQuery> }) {
	const [post, postState] = useQuery(postQuery, props.handle);
	return (
		<article aria-busy={postState.isFetching}>
			<h1>
				{post.title}
				{postState.isFetching ? <Spinner label="Refreshing" /> : null}
			</h1>
			<p>{post.body}</p>
		</article>
	);
}
// #endregion
