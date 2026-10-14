import { infiniteQueryOptions, queryOptions } from "@raf-query/react";
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

/** Fails with `IssueNotFound | RpcClientError`; the issue page's loader handles both. */
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

export function assigneeQuery(input: { issueId: number }) {
	return queryOptions({
		// `null` for a missing issue: the issue query already 404s the page, and
		// this one starts beside it, so failing here would fail a second time.
		// Catching the tag removes it from the query's error type.
		queryFn: () =>
			Effect.gen(function* () {
				const issues = yield* Issues;
				return yield* issues.GetIssueAssignee(input);
			}).pipe(Effect.catchTag("IssueNotFound", () => Effect.succeed(null))),
		queryKey: ["issues", "assignee", input.issueId],
	});
}
