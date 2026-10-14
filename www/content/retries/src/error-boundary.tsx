import { type QueryHandle } from "@raf-query/react";
import {
	CatchBoundary,
	type ErrorComponentProps,
} from "@tanstack/react-router";
import { Suspense } from "react";

import { Comments, CommentsSkeleton } from "./components/comments";
import { commentsQuery } from "./queries";

declare const post: { hash: string };
declare const loaderData: { comments: QueryHandle<typeof commentsQuery> };

function CommentsError(props: ErrorComponentProps) {
	return (
		<div role="alert">
			<p>
				{"Could not load comments: "}
				{props.error instanceof Error
					? props.error.message
					: String(props.error)}
			</p>
			<button onClick={props.reset} type="button">
				Try again
			</button>
		</div>
	);
}

export function ErrorExample() {
	// #region boundary
	return (
		<CatchBoundary errorComponent={CommentsError} getResetKey={() => post.hash}>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={loaderData.comments} />
			</Suspense>
		</CatchBoundary>
	);
	// #endregion
}
