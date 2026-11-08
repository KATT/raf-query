import {
	invalidateMany,
	load,
	prefetch,
	type QueryHandle,
	swr,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";

import { addComment } from "~/api.ts";
import { CommentsSkeleton, renderComment } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";

// #region route
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const { slug } = args.params;
		const [handles] = await load(args.context.queryClient, {
			// Waits only if the post isn't in the cache yet.
			post: swr(postQuery, { slug }),
			// Never waits: the comments load while the page renders.
			comments: prefetch(commentsQuery, { slug }),
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
			<AddComment slug={post.slug} />
		</article>
	);
}

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// May still be loading. If so, use() suspends until it lands.
	const [pagesThenable, commentsState] = useInfiniteQuery(
		commentsQuery,
		props.handle,
	);
	const pages = use(pagesThenable);
	//     ^?
	return (
		<>
			{pages.pages.flatMap((page) => page.items).map(renderComment)}
			{commentsState.hasNextPage ? (
				<button
					disabled={commentsState.isFetchingNextPage}
					onClick={() => commentsState.fetchNextPage()}
				>
					{commentsState.isFetchingNextPage ? "Loading…" : "Load more"}
				</button>
			) : null}
		</>
	);
}
// #endregion component

// #region add-comment
function AddComment(props: { slug: string }) {
	const queryClient = useQueryClient();
	return (
		<form
			action={async (formData) => {
				await addComment({
					body: String(formData.get("body")),
					slug: props.slug,
				});
				await invalidateMany(queryClient, [
					[commentsQuery, { slug: props.slug }],
				]);
			}}
		>
			<textarea name="body" required />
			<button>Add comment</button>
		</form>
	);
}
// #endregion add-comment
