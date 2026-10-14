"use client";

// #region component
// #endregion

import { type QueryHandle, useQuery } from "@raf-query/react";

import { commentsQuery } from "~/queries.ts";

// #region component
export function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [commentsPromise] = useQuery(commentsQuery, props.handle);
	// ...
	// #endregion
	void commentsPromise;
	return null;
}
