import { use } from "react";

import type { Post } from "../api";

export function PostBody(props: { post: Promise<Post> }) {
	const post = use(props.post);
	return <p>{post.body}</p>;
}

export function PostSkeleton() {
	return <p>Loading post…</p>;
}
