import type { QueryHandle } from "@raf-query/react";
import { useQuery } from "@raf-query/react";
import { Suspense, use, type ReactNode } from "react";
import type { Post } from "~/api.ts";
import { postQuery } from "~/queries.ts";

declare function PostSkeleton(): ReactNode;

// #region while-it-retries
function Post(props: { handle: QueryHandle<typeof postQuery> }) {
	const [postPromise, postState] = useQuery(postQuery, props.handle);
	return (
		<>
			{postState.isFetching && postState.failureCount > 0 ? (
				<p role="status">Retrying ({postState.failureCount}/3)…</p>
			) : null}
			<Suspense fallback={<PostSkeleton />}>
				<PostBody post={postPromise} />
			</Suspense>
		</>
	);
}
// #endregion

function PostBody(props: { post: Promise<Post> }) {
	const post = use(props.post);
	return <p>{post.body}</p>;
}
