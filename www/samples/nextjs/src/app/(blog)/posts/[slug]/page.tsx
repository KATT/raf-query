import { HydrationBoundary } from "@raf-query/react";
import { Suspense } from "react";

import { Comments } from "../../components/comments.tsx";
import { CommentsSkeleton } from "../../components/comments-skeleton.tsx";
import { Post } from "../../components/post.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

declare function PostSkeleton(): React.ReactNode;

// #region page
export default async function Page(props: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await props.params;
	const qc = getQueryClient();
	// Never waits: both load while the page streams.
	const comments = qc.prefetch(commentsQuery, { slug });
	const post = qc.prefetch(postQuery, { slug });
	return (
		<HydrationBoundary client={qc}>
			<article>
				<Suspense fallback={<PostSkeleton />}>
					<Post handle={post} />
				</Suspense>
				<Suspense fallback={<CommentsSkeleton />}>
					<Comments handle={comments} />
				</Suspense>
			</article>
		</HydrationBoundary>
	);
}
// #endregion page
