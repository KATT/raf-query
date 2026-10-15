import {
	dehydrate,
	QueryClient,
	type QueryHandle,
	useQuery,
} from "@raf-query/react";
import { HydrationBoundary } from "@raf-query/react/react-router";
import { Suspense, use } from "react";

import { Comments, CommentsSkeleton } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";

import type { Route } from "./+types/posts.$slug";

// #region loader
export async function loader(args: Route.LoaderArgs) {
	const qc = new QueryClient();
	const { slug } = args.params;
	// Doesn't wait: the comments stream in after the page renders.
	const comments = qc.prefetch(commentsQuery, { slug });
	// Waits, so the post is in the page's first HTML.
	const post = await qc.ensure(postQuery, { slug });
	return {
		comments,
		dehydratedState: dehydrate(qc),
		post,
	};
}
// #endregion loader

// #region component
export default function PostPage(props: Route.ComponentProps) {
	const { comments, dehydratedState, post } = props.loaderData;
	return (
		<HydrationBoundary state={dehydratedState}>
			<article>
				<Post handle={post} />
				<Suspense fallback={<CommentsSkeleton />}>
					<Comments handle={comments} />
				</Suspense>
			</article>
		</HydrationBoundary>
	);
}

function Post(props: { handle: QueryHandle<typeof postQuery> }) {
	// The loader's ensure put the post in the cache, so use() doesn't suspend.
	const [postPromise] = useQuery(postQuery, props.handle);
	const post = use(postPromise);
	//     ^?
	return <h1>{post.title}</h1>;
}
// #endregion component
