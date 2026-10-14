import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense, use } from "react";

import type { Post } from "./api";
import { postQuery } from "./queries";

function PostBody(props: { post: Promise<Post> }) {
	const post = use(props.post);
	return <p>{post.body}</p>;
}

function Spinner() {
	return <p>Loading…</p>;
}

export function Parent(props: {
	loaderData: { post: QueryHandle<typeof postQuery> };
}) {
	// #region parent
	const [postPromise] = useQuery(postQuery, props.loaderData.post);
	return (
		<Suspense fallback={<Spinner />}>
			<PostBody post={postPromise} />
		</Suspense>
	);
	// #endregion
}
