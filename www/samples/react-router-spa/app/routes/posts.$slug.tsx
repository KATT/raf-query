import {
	type DefinedQueryHandle,
	ensureEntry,
	load,
	prefetchEntry,
	useQuery,
} from "@raf-query/react";
import { Suspense } from "react";

import { Comments, CommentsSkeleton } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";
import { queryClient } from "~/query-client.ts";

import type { Route } from "./+types/posts.$slug";

// #region loader
export async function clientLoader(args: Route.ClientLoaderArgs) {
	const { slug } = args.params;
	const [handles] = await load(queryClient, {
		// Doesn't wait: the comments stream in after the page renders.
		comments: prefetchEntry(commentsQuery, { slug }),
		// Waits on the first visit only. Coming back shows the cached post at
		// once, and refetches it behind the page once it's stale.
		post: ensureEntry(postQuery, { slug }),
	});
	return handles;
}
// #endregion loader

// #region component
export default function PostPage(props: Route.ComponentProps) {
	const { comments, post } = props.loaderData;
	return (
		<article>
			<Post handle={post} />
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={comments} />
			</Suspense>
		</article>
	);
}

function Post(props: { handle: DefinedQueryHandle<typeof postQuery> }) {
	// The loader waited for the post, so this is the post, not a promise.
	const [post] = useQuery(postQuery, props.handle);
	//     ^?
	return <h1>{post.title}</h1>;
}
// #endregion component
