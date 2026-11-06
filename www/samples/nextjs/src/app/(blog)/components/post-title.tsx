// #region component
"use client";
// #endregion

import { type DefinedQueryHandle, useQuery } from "@raf-query/react";

import { postQuery } from "~/queries.ts";

// #region component
export function PostTitle(props: {
	handle: DefinedQueryHandle<typeof postQuery>;
}) {
	// The server component waited for the post: this is the post, not a promise.
	const [post] = useQuery(postQuery, props.handle);
	//     ^?
	return <h1>{post.title}</h1>;
}
// #endregion component
