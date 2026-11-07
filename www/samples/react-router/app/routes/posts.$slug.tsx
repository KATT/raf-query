import {
	type QueryHandle,
	fetchEntry,
	HydrationBoundary,
	load,
	prefetchEntry,
	useQuery,
} from "@raf-query/react";
import { dehydrate } from "@raf-query/react/hydration";
import { Suspense, use } from "react";
import { redirect } from "react-router";

import { Comments, CommentsSkeleton } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";
import { queryClientContext } from "~/query-client.ts";

import type { Route } from "./+types/posts.$slug";

// #region loader
export async function loader(args: Route.LoaderArgs) {
	const qc = args.context.get(queryClientContext);
	const { slug } = args.params;
	const [handles, data] = await load(qc, {
		// Doesn't wait: the comments stream in after the page renders.
		comments: prefetchEntry(commentsQuery, { slug }),
		// Waits, so the post is in the page's first HTML.
		post: fetchEntry(postQuery, { slug }),
	});
	// `data` holds what the loader waited for: here, the post.
	if (data.post.slug !== slug) {
		throw redirect(`/posts/${data.post.slug}`);
	}
	return { ...handles, dehydratedState: dehydrate(qc) };
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
	// The loader waited for the post, so this is the post, not a promise.
	const [postThenable] = useQuery(postQuery, props.handle);
	const post = use(postThenable);
	//     ^?
	return <h1>{post.title}</h1>;
}
// #endregion component
