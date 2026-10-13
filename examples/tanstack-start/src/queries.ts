import type {
	CommentPage,
	IssueListInput,
	IssuePage,
} from "@examples/db/types";
import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

import {
	countIssues,
	getIssue,
	getUser,
	listComments,
	listIssues,
} from "./server-functions.ts";

export function issueListQuery(input: IssueListInput) {
	return infiniteQueryOptions<IssuePage, number>({
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryFn: (context) =>
			listIssues({ data: { ...input, cursor: context.pageParam } }),
		queryKey: ["issues", "list", input],
	});
}

export function issueCountsQuery() {
	return queryOptions({
		queryFn: () => countIssues(),
		queryKey: ["issues", "counts"],
	});
}

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () => getIssue({ data: input.id }),
		queryKey: ["issues", "detail", input.id],
	});
}

export function commentsQuery(input: { issueId: number }) {
	return infiniteQueryOptions<CommentPage, number>({
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryFn: (context) =>
			listComments({
				data: { cursor: context.pageParam, issueId: input.issueId },
			}),
		queryKey: ["issues", "comments", input.issueId],
	});
}

export function userQuery(input: { id: string }) {
	return queryOptions({
		queryFn: () => getUser({ data: input.id }),
		queryKey: ["users", input.id],
		staleTime: 60_000,
	});
}
