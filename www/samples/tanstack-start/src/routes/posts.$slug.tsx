import { type QueryHandle, useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";

import { CommentsSkeleton, renderComment } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";

// #region home
// #region route
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		// Comments stream in after the route changes, under the skeleton below.
		const comments = qc.prefetch(commentsQuery, { slug: args.params.slug });
		// The route change waits for the post.
		const post = await qc.ensure(postQuery, { slug: args.params.slug });
		return { comments, post };
	},
	component: PostPage,
});
// #endregion route

function PostPage() {
	const data = Route.useLoaderData();
	// The route already waited for this, so it's the post itself.
	const [post] = useQuery(postQuery, data.post);
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
	// Still loading. use() suspends until the pages stream in.
	const [pages] = useQuery(commentsQuery, props.handle);
	//     ^?
	return use(pages)
		.pages.flatMap((page) => page.items)
		.map(renderComment);
}
// #endregion home
