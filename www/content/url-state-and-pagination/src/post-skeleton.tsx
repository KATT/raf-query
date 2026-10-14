import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense } from "react";

import { PostBody, PostSkeleton } from "./components/post-body";
import { postQuery } from "./post-query";

declare const loaderData: { post: QueryHandle<typeof postQuery> };

export function PostPage() {
	// #region skeleton
	// This loader prefetches the post instead of ensuring it.
	const [postPromise, postState] = useQuery(postQuery, loaderData.post);

	return (
		<Suspense fallback={<PostSkeleton />} key={postState.hash}>
			<PostBody post={postPromise} />
		</Suspense>
	);
	// #endregion
}
