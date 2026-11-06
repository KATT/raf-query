import {
	load,
	prefetchEntry,
	type QueryHandle,
	useQueryClient,
} from "@raf-query/react";
import {
	CatchBoundary,
	type ErrorComponentProps,
} from "@tanstack/react-router";
import { type ReactNode, Suspense } from "react";
import { commentsQuery } from "~/queries.ts";

declare const loaderData: { comments: QueryHandle<typeof commentsQuery> };

declare function Comments(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}): ReactNode;

declare function CommentsSkeleton(): ReactNode;

// #region showing-errors
function CommentsSection() {
	return (
		<CatchBoundary
			getResetKey={() => loaderData.comments.input.slug}
			errorComponent={CommentsError}
		>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={loaderData.comments} />
			</Suspense>
		</CatchBoundary>
	);
}

function CommentsError(props: ErrorComponentProps) {
	const queryClient = useQueryClient();
	return (
		<div role="alert">
			<p>
				Couldn't load comments:{" "}
				{props.error instanceof Error
					? props.error.message
					: String(props.error)}
			</p>
			<button
				onClick={() => {
					void load(queryClient, {
						comments: prefetchEntry(commentsQuery, loaderData.comments.input),
					});
					props.reset();
				}}
			>
				Try again
			</button>
		</div>
	);
}
// #endregion
