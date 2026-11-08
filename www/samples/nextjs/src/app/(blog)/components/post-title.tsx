// #region component
"use client";
// #endregion

import { use } from "react";
import { type QueryHandle, useQuery } from "@raf-query/react";

import { postQuery } from "~/queries.ts";

// #region component
export function PostTitle(props: { handle: QueryHandle<typeof postQuery> }) {
	// The server component waited for the post: this is the post, not a promise.
	const [postThenable] = useQuery(postQuery, props.handle);
	const post = use(postThenable);
	//     ^?
	return <h1>{post.title}</h1>;
}
// #endregion component
