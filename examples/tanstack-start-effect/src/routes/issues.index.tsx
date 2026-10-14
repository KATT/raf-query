import { Skeleton } from "@examples/ui/components/skeleton";
import { QueryCache } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { Suspense } from "react";

import { IssueList, IssueListSkeleton } from "~/components/issue-list.tsx";
import { StatusFilter } from "~/components/status-filter.tsx";
import { issueCountsQuery, issueListQuery } from "~/queries.ts";
import { IssueListInput } from "~/rpc.ts";

export const Route = createFileRoute("/issues/")({
	validateSearch: Schema.toStandardSchemaV1(IssueListInput),
	loaderDeps: (args) => args.search,
	loader: (args) =>
		args.context.queryClient.runPromise(
			Effect.gen(function* () {
				const cache = yield* QueryCache.QueryCache;
				return {
					counts: yield* cache.prefetch(issueCountsQuery),
					issues: yield* cache.prefetch(issueListQuery, args.deps),
				};
			}),
		),
	component: IssuesPage,
});

function IssuesPage() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();

	return (
		<div className="grid gap-8 md:grid-cols-[180px_1fr]">
			<Suspense fallback={<Skeleton className="h-48" />}>
				<StatusFilter counts={data.counts} current={search} />
			</Suspense>
			<Suspense fallback={<IssueListSkeleton />}>
				<IssueList handle={data.issues} />
			</Suspense>
		</div>
	);
}
