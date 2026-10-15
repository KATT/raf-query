import { type QueryHandle, useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";

import { CommentsSkeleton, renderComment } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";

declare function PostSkeleton(): React.ReactNode;

// Homepage samples use this route. `posts.$slug.tsx` keeps ensure+prefetch for
// the guides that teach that split.

// #region route
export const Route = createFileRoute("/blog/$slug")({
	loader: (args) => {
		const qc = args.context.queryClient;
		const { slug } = args.params;
		// Never waits: both load while the page renders.
		const comments = qc.prefetch(commentsQuery, { slug });
		const post = qc.prefetch(postQuery, { slug });
		return { comments, post };
	},
	component: PostPage,
});
// #endregion route

// #region component
function PostPage() {
	const data = Route.useLoaderData();
	return (
		<article>
			<Suspense fallback={<PostSkeleton />}>
				<Post handle={data.post} />
			</Suspense>
			<Suspense fallback={<CommentsSkeleton />}>
				<PostComments handle={data.comments} />
			</Suspense>
		</article>
	);
}

function Post(props: { handle: QueryHandle<typeof postQuery> }) {
	const [post] = useQuery(postQuery, props.handle);
	//     ^?
	return <h1>{use(post).title}</h1>;
}

function PostComments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// ---collapse---
	// May still be loading. If so, use() suspends until it lands.
	const [pages] = useQuery(commentsQuery, props.handle);
	return use(pages)
		.pages.flatMap((page) => page.items)
		.map(renderComment);
	// ---/collapse---
}
// #endregion component
