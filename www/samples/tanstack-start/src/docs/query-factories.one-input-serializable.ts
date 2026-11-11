import { group, load, prefetch } from "@raf-query/react";
import { infiniteQueryOptions } from "~/raf.ts";
import { feedQuery, postQuery } from "~/queries.ts";
import { type CommentPage, listComments } from "~/api.ts";
import { makeQueryClient } from "~/query-client.ts";

const qc = makeQueryClient();
const comments = group("comments");

// #region one-input-serializable
await load(qc, {
	post: prefetch(postQuery, { slug: "hello-world" }),
	feed: prefetch(feedQuery), // a factory without input
});
// #endregion

// #region type-inference
const commentsOptions = infiniteQueryOptions({
	getNextPageParam: (lastPage: CommentPage) => lastPage.nextCursor,
	initialPageParam: 0,
	queryFn: (context) =>
		listComments({ cursor: context.pageParam, slug: "hello-world" }),
	queryKey: comments("hello-world"),
});
commentsOptions;
// ^?
// #endregion

// #region type-helpers
import type { DataOf, InputOf, QueryHandle } from "@raf-query/react";

type PostData = DataOf<typeof postQuery>; // what readers get
//   ^?
type PostInput = InputOf<typeof postQuery>;
//   ^?
type PostHandle = QueryHandle<typeof postQuery>; // for props
// #endregion
