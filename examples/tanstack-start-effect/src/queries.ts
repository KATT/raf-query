import {
	type ErrorOf,
	infiniteQueryOptions,
	queryOptions,
	type ServicesOf,
} from "@raf-query/react";
import { Schema } from "effect";

import { Issues } from "~/issues.ts";
import { type IssueListInput, IssueNotFound } from "~/rpc.ts";

export function issueListQuery(input: IssueListInput) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			Issues.use((issues) =>
				issues.ListIssues({
					...input,
					cursor: context.pageParam,
				}),
			),
		// After `queryFn`: TypeScript infers the page type from the first one.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: ["issues", "list", input],
	});
}

export function issueCountsQuery() {
	return queryOptions({
		queryFn: () => Issues.use((issues) => issues.CountIssues()),
		queryKey: ["issues", "counts"],
	});
}

/**
 * Fails with {@link IssueQueryError}. The issue page's loader catches
 * `IssueNotFound` into the router's `notFound()`.
 */
export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () => Issues.use((issues) => issues.GetIssue(input)),
		queryKey: ["issues", "detail", input.id],
		// A missing issue won't turn up on a retry.
		retry: (failures, error) =>
			failures <= 3 && !Schema.is(IssueNotFound)(error),
	});
}

export type IssueQueryError = ErrorOf<typeof issueQuery>;
export type IssueQueryServices = ServicesOf<typeof issueQuery>;

export function commentsQuery(input: { issueId: number }) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			Issues.use((issues) =>
				issues.ListComments({
					...input,
					cursor: context.pageParam,
				}),
			),
		// After `queryFn`, as above.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: ["issues", "comments", input.issueId],
	});
}

/** Fails with {@link AssigneeQueryError}; React narrows with `Schema.is`. */
export function assigneeQuery(input: { issueId: number }) {
	return queryOptions({
		queryFn: () => Issues.use((issues) => issues.GetIssueAssignee(input)),
		queryKey: ["issues", "assignee", input.issueId],
		retry: (failures, error) =>
			failures <= 3 && !Schema.is(IssueNotFound)(error),
	});
}

export type AssigneeQueryError = ErrorOf<typeof assigneeQuery>;
