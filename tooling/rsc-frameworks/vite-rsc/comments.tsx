"use client";

import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";

import { commentsQuery } from "./queries.ts";

export function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [commentsThenable] = useQuery(commentsQuery, props.handle);
	const comments = use(commentsThenable);
	return comments.map((comment) => <p key={comment}>{comment}</p>);
}
