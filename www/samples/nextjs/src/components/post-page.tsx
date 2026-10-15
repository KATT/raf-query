// #region component
"use client";
// #endregion

import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense, use } from "react";

import type { PostComment } from "~/api.ts";
import { CommentsSkeleton } from "~/components/comments-skeleton.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";

declare function PostSkeleton(): React.ReactNode;
declare function renderComment(comment: PostComment): React.ReactNode;

// #region component
export function PostPage(props: {
	comments: QueryHandle<typeof commentsQuery>;
	post: QueryHandle<typeof postQuery>;
}) {
	return (
		<article>
			<Suspense fallback={<PostSkeleton />}>
				<PostTitle handle={props.post} />
			</Suspense>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={props.comments} />
			</Suspense>
		</article>
	);
}

function PostTitle(props: { handle: QueryHandle<typeof postQuery> }) {
	const [post] = useQuery(postQuery, props.handle);
	//     ^?
	return <h1>{use(post).title}</h1>;
}

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// May still be loading. If so, use() suspends until it lands.
	const [comments] = useQuery(commentsQuery, props.handle);
	//     ^?
	return use(comments).map(renderComment);
}
// #endregion component
