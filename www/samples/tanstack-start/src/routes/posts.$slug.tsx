import {
	load,
	prefetch,
	type QueryHandle,
	swr,
	useInfiniteQuery,
	useQuery,
} from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";

import { CommentsSkeleton, renderComment } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";

// #region route
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const { slug } = args.params;
		const [handles] = await load(args.context.queryClient, {
			// Never waits: the comments load while the page renders.
			comments: prefetch(commentsQuery, { slug }),
			// Waits only if the post isn't in the cache yet.
			post: swr(postQuery, { slug }),
		});
		return handles;
	},
	component: PostPage,
});
// #endregion route

// #region component
function PostPage() {
	const data = Route.useLoaderData();
	// The route already waited for this, so this is the post itself.
	const [postThenable] = useQuery(postQuery, data.post);
	const post = use(postThenable);
	//     ^?
	return (
		<article>
			<h1>{post.title}</h1>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={data.comments} />
			</Suspense>
		</article>
	);
}

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// May still be loading. If so, use() suspends until it lands.
	const [pagesThenable] = useInfiniteQuery(commentsQuery, props.handle);
	//     ^?
	const pages = use(pagesThenable);
	return pages.pages.flatMap((page) => page.items).map(renderComment);
}
// #endregion component
