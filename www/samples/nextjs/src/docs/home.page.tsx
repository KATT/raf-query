import { HydrationBoundary } from "@raf-query/react/rsc";

import { PostPage } from "~/components/post-page.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

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
			<PostPage comments={comments} post={post} />
		</HydrationBoundary>
	);
}
// #endregion page
