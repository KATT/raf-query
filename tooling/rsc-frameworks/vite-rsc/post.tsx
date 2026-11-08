"use client";

import { use } from "react";
import { type QueryHandle, useQuery } from "@raf-query/react";

import { postQuery } from "./queries.ts";

export function Post(props: { handle: QueryHandle<typeof postQuery> }) {
	const [postThenable] = useQuery(postQuery, props.handle);
	const post = use(postThenable);
	return <h1>{post.title}</h1>;
}
