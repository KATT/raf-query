import {
	type ErrorOf,
	infiniteQueryOptions,
	queryOptions,
	type ServicesOf,
} from "@raf-query/react";
import { Effect, Schema } from "effect";

import { Issues } from "~/issues.ts";
import { type IssueListInput, IssueNotFound } from "~/rpc.ts";

export function issueListQuery(input: IssueListInput) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			Effect.gen(function* () {
				const issues = yield* Issues;
				return yield* issues.ListIssues({
					...input,
					cursor: context.pageParam,
				});
			}),
		// After `queryFn`: TypeScript infers the page type from the first one.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: ["issues", "list", input],
	});
}

export function issueCountsQuery() {
	return queryOptions({
		queryFn: () =>
			Effect.gen(function* () {
				const issues = yield* Issues;
				return yield* issues.CountIssues();
			}),
		queryKey: ["issues", "counts"],
	});
}

/**
 * Fails with {@link IssueQueryError}. The issue page's loader catches
 * `IssueNotFound` into the router's `notFound()`.
 */
export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () =>
			Effect.gen(function* () {
				const issues = yield* Issues;
				return yield* issues.GetIssue(input);
			}),
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
			Effect.gen(function* () {
				const issues = yield* Issues;
				return yield* issues.ListComments({
					...input,
					cursor: context.pageParam,
				});
			}),
		// After `queryFn`, as above.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: ["issues", "comments", input.issueId],
	});
}

/**
 * `IssueNotFound` is caught into `null`, so it is out of
 * {@link AssigneeQueryError}; a missing assignee renders as unassigned.
 */
export function assigneeQuery(input: { issueId: number }) {
	return queryOptions({
		queryFn: () =>
			Effect.gen(function* () {
				const issues = yield* Issues;
				return yield* issues.GetIssueAssignee(input);
			}).pipe(Effect.catchTag("IssueNotFound", () => Effect.succeed(null))),
		queryKey: ["issues", "assignee", input.issueId],
	});
}

export type AssigneeQueryError = ErrorOf<typeof assigneeQuery>;
