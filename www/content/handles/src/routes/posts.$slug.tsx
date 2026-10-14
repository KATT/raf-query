import { type DataOf, useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";

import { commentsQuery, postQuery } from "../queries";

export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const input = { slug: args.params.slug };
		return {
			comments: qc.prefetch(commentsQuery, input),
			post: await qc.ensure(postQuery, input),
		};
	},
	component: PostPage,
});

function PostPage() {
	// #region read
	const loaderData = Route.useLoaderData();
	const [post] = useQuery(postQuery, loaderData.post); // ensured
	//     ^?
	const [commentsPromise] = useQuery(commentsQuery, loaderData.comments); // prefetched
	//     ^?
	// #endregion
	return (
		<article>
			<h1>{post.title}</h1>
			<p>{post.body}</p>
			<Suspense fallback={<p>Loading comments…</p>}>
				<CommentCount promise={commentsPromise} />
			</Suspense>
		</article>
	);
}

function CommentCount(props: {
	promise: Promise<DataOf<typeof commentsQuery>>;
}) {
	const data = use(props.promise);
	return <p>{data.pages.flatMap((page) => page.items).length} comments</p>;
}
