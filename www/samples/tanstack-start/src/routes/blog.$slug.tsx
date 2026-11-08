import {
	load,
	prefetch,
	type QueryHandle,
	useInfiniteQuery,
	useQuery,
} from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";

import { CommentsSkeleton, renderComment } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";

declare function PostSkeleton(): React.ReactNode;

// Homepage sample: one file. `posts.$slug.tsx` keeps swr+prefetch for the
// guides that teach that split.

// #region hero
// #region route
export const Route = createFileRoute("/blog/$slug")({
	loader: async (args) => {
		const { slug } = args.params;
		// Never waits: both load while the page renders.
		const [handles] = await load(args.context.queryClient, {
			comments: prefetch(commentsQuery, { slug }),
			post: prefetch(postQuery, { slug }),
		});
		return handles;
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
	const [postThenable] = useQuery(postQuery, props.handle);
	//     ^?
	const post = use(postThenable);
	return <h1>{post.title}</h1>;
}

// ---collapse---
function PostComments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// May still be loading. If so, use() suspends until it lands.
	const [pagesThenable] = useInfiniteQuery(commentsQuery, props.handle);
	const pages = use(pagesThenable);
	return pages.pages.flatMap((page) => page.items).map(renderComment);
}
// ---/collapse---
// #endregion component
// #endregion hero
