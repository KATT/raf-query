import {
	createQueryClient,
	group,
	infiniteQueryOptions,
	load,
	prefetch,
} from "@raf-query/react";
import { postQuery } from "~/queries.ts";
import { type CommentPage, listComments } from "~/api.ts";

const qc = createQueryClient();
const issues = group("issues");
const comments = group("comments");

declare function listIssues(input: { cursor: number }): Promise<{
	items: ReadonlyArray<{ id: number }>;
	nextCursor: number | null;
}>;

function issuesQuery() {
	return infiniteQueryOptions({
		queryKey: issues(),
		queryFn: (context) => listIssues({ cursor: context.pageParam }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}

// #region one-input-serializable
await load(qc, {
	post: prefetch(postQuery, { slug: "hello-world" }),
	issues: prefetch(issuesQuery), // a factory without input
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
