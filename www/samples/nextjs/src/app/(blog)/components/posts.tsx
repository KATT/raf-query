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
	const { page } = postsState.input;
	return (
		<>
			<PostList dimmed={postsState.isPrevious} posts={posts.items} />
			<nav aria-busy={postsState.isPrevious}>
				{page > 1 ? (
					<Link href={{ query: { page: page - 1 } }}>Previous</Link>
				) : null}
				{page < posts.pageCount ? (
					<Link href={{ query: { page: page + 1 } }}>Next</Link>
				) : null}
			</nav>
		</>
	);
}
// #endregion component
