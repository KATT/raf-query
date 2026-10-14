import { type QueryHandle, useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { PostBody, PostSkeleton } from "../components/post-body";
import { postQuery } from "../queries";

export const Route = createFileRoute("/posts/$slug")({
	loader: (args) =>
		({
			post: args.context.queryClient.prefetch(postQuery, {
				slug: args.params.slug,
			}),
		}) satisfies { post: QueryHandle<typeof postQuery> },
	component: PostPage,
});

// #region tracked
function PostPage() {
	const loaderData = Route.useLoaderData();
	// Reads only the promise: doesn't re-render while refetching.
	const [postPromise] = useQuery(postQuery, loaderData.post);
	return (
		<>
			<RefreshButton handle={loaderData.post} />
			<Suspense fallback={<PostSkeleton />}>
				<PostBody post={postPromise} />
			</Suspense>
		</>
	);
}

function RefreshButton(props: { handle: QueryHandle<typeof postQuery> }) {
	// Reads isFetching: re-renders when a request starts and ends.
	const [, post] = useQuery(postQuery, props.handle);
	return (
		<button
			disabled={post.isFetching}
			onClick={() => post.refetch()}
			type="button"
		>
			Refresh
		</button>
	);
}
// #endregion
