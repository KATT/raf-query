import { IssueListSearchParams } from "@examples/db/types";
import { Skeleton } from "@examples/ui/components/skeleton";
import { HydrationBoundary } from "@raf-query/react/rsc";
import { Suspense } from "react";

import { IssueList, IssueListSkeleton } from "~/components/issue-list.tsx";
import { StatusFilter } from "~/components/status-filter.tsx";
import { issueCountsQuery, issueListQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

export default async function IssuesPage(props: {
	readonly searchParams: Promise<
		Record<string, string | ReadonlyArray<string>>
	>;
}) {
	const input = IssueListSearchParams.parse(await props.searchParams);
	const qc = getQueryClient();
	const counts = qc.prefetch(issueCountsQuery);
	const issues = qc.prefetch(issueListQuery, input);

	return (
		<HydrationBoundary client={qc}>
			<div className="grid gap-8 md:grid-cols-[180px_1fr]">
				<Suspense fallback={<Skeleton className="h-48" />}>
					<StatusFilter counts={counts} current={input} />
				</Suspense>
				<Suspense fallback={<IssueListSkeleton />}>
					<IssueList handle={issues} />
				</Suspense>
			</div>
		</HydrationBoundary>
	);
}
