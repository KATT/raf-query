import { type QueryHandle, useQuery } from "@raf-query/react";
import { type ReactNode, Suspense } from "react";
import type { Post } from "~/api.ts";
import { postQuery } from "~/queries.ts";

declare const loaderData: { post: QueryHandle<typeof postQuery> };

declare function PostBody(props: { readonly post: Promise<Post> }): ReactNode;

declare function PostSkeleton(): ReactNode;

function PostPage() {
	// #region skeletons-for-unrelated-content
	// This loader starts the post with `prefetchEntry`.
	const [postPromise, controls] = useQuery(postQuery, loaderData.post);

	return (
		<Suspense key={controls.hash} fallback={<PostSkeleton />}>
			<PostBody post={postPromise} />
		</Suspense>
	);
	// #endregion
}
