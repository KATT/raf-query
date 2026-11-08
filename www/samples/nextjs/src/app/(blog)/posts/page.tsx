import { HydrationBoundary, load, prefetch } from "@raf-query/react";

import { Posts } from "~/app/(blog)/components/posts.tsx";
import { PostListInput } from "~/post-list-input.ts";
import { postsQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

// #region page
export default async function PostsPage(props: {
	searchParams: Promise<Record<string, string | Array<string>>>;
}) {
	// `?page=2` → `{ page: 2 }`
	const input = PostListInput.parse(await props.searchParams);
	const qc = getQueryClient();
	const [handles] = await load(qc, {
		posts: prefetch(postsQuery, input),
	});
	return (
		<HydrationBoundary client={qc}>
			<Posts handle={handles.posts} />
		</HydrationBoundary>
	);
}
// #endregion page
