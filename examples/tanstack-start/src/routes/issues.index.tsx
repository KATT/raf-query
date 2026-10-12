import { IssueListInput } from "@examples/db/types";
import { Skeleton } from "@examples/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { Suspense } from "react";

import { IssueList, IssueListSkeleton } from "~/components/issue-list.tsx";
import { StatusFilter } from "~/components/status-filter.tsx";
import { issueCountsQuery, issueListQuery } from "~/queries.ts";

export const Route = createFileRoute("/issues/")({
	validateSearch: Schema.toStandardSchemaV1(IssueListInput),
	loaderDeps: (context) => context.search,
	loader: (context) => ({
		counts: context.context.queryClient.prefetch(issueCountsQuery),
		issues: context.context.queryClient.prefetch(issueListQuery, context.deps),
	}),
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
