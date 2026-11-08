import {
	HydrationBoundary,
	load,
	prefetch,
	revalidate,
} from "@raf-query/react";
import { Suspense } from "react";

import { Comments } from "~/app/(blog)/components/comments.tsx";
import { CommentsSkeleton } from "~/app/(blog)/components/comments-skeleton.tsx";
import { PostTitle } from "~/app/(blog)/components/post-title.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

declare const slug: string;

// #region fetch
const qc = getQueryClient();
const [handles, data] = await load(qc, {
	comments: prefetch(commentsQuery, { slug }),
	// Waits, so the server component can render the post.
	post: revalidate(postQuery, { slug }),
});

<HydrationBoundary client={qc}>
	<title>{data.post.title}</title>
	<PostTitle handle={handles.post} />
	<Suspense fallback={<CommentsSkeleton />}>
		<Comments handle={handles.comments} />
	</Suspense>
</HydrationBoundary>;
// #endregion fetch
