import type { CommentPage, IssueListInput } from "@examples/db/types";
import {
	infiniteQueryOptions,
	queryOptions,
} from "@raf-query/experimental-tanstack-react-query";

import {
	countIssues,
	getIssue,
	getUser,
	listComments,
	listIssues,
} from "./actions.ts";

export function issueListQuery(input: IssueListInput) {
	return queryOptions({
		queryFn: () => listIssues(input),
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
		queryFn: () => getIssue(input.id),
		queryKey: ["issues", "detail", input.id],
	});
}

export function commentsQuery(input: { issueId: number }) {
	return infiniteQueryOptions<CommentPage, number>({
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, issueId: input.issueId }),
		queryKey: ["issues", "comments", input.issueId],
	});
}

export function userQuery(input: { id: string }) {
	return queryOptions({
		queryFn: () => getUser(input.id),
		queryKey: ["users", input.id],
		staleTime: 60_000,
	});
}
