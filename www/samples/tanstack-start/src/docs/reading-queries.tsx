import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense, startTransition, use } from "react";
import { commentsQuery, postQuery } from "~/queries.ts";

declare function CommentsSkeleton(): React.ReactNode;

declare function Comments(props: {
	handle: QueryHandle<typeof commentsQuery>;
}): React.ReactNode;

// #region post-page
// The handles `load` returned, passed down from the loader or server component.
function PostPage(props: {
	post: QueryHandle<typeof postQuery>;
	comments: QueryHandle<typeof commentsQuery>;
}) {
	const [postThenable, postState] = useQuery(postQuery, props.post);
	const post = use(postThenable);

	return (
		<article>
			<h1>{post.title}</h1>
			<button
				disabled={postState.isFetching}
				onClick={() => startTransition(() => postState.refetch())}
			>
				Refresh
			</button>
			<p>{post.body}</p>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={props.comments} />
			</Suspense>
		</article>
	);
}
// #endregion

declare function DetailsTable(props: { details: Details }): React.ReactNode;

interface Details {
	readonly body: string;
}

// #region details
function Details(props: { open: boolean; details: Promise<Details> }) {
	if (!props.open) return null;
	const details = use(props.details);
	return <DetailsTable details={details} />;
}
// #endregion
