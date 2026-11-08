// #region component
"use client";
// #endregion component

import { type QueryHandle, useQuery } from "@raf-query/react";
import Link from "next/link";
import { use } from "react";

import type { Post } from "~/api.ts";
import { postsQuery } from "~/queries.ts";

declare function PostList(props: {
	dimmed: boolean;
	posts: ReadonlyArray<Post>;
}): React.ReactNode;

// #region component
export function Posts(props: { handle: QueryHandle<typeof postsQuery> }) {
	const [postsThenable, postsState] = useQuery(postsQuery, props.handle, {
		whilePending: "previous",
	});
	const posts = use(postsThenable);
	const { input } = postsState;
	return (
		<>
			<nav aria-busy={postsState.isPrevious}>
				<Link href={{ query: { ...input, sort: "newest" } }}>Newest</Link>
				<Link href={{ query: { ...input, sort: "oldest" } }}>Oldest</Link>
			</nav>
			<PostList dimmed={postsState.isPrevious} posts={posts} />
		</>
	);
}
// #endregion component
