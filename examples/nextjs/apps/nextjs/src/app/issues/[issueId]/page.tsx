import { IssueId } from "@examples/db/types";
import { HydrationBoundary } from "@raf-query/react/rsc";
import { notFound } from "next/navigation";
import { z } from "zod";

import { IssuePage } from "~/components/issue-page.tsx";
import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

const IssueIdParam = z.coerce.number<string>().pipe(IssueId);

export default async function Page(props: {
	readonly params: Promise<{ issueId: string }>;
}) {
	const params = await props.params;
	const parsed = IssueIdParam.safeParse(params.issueId);
	if (!parsed.success) {
		notFound();
	}
	const id = parsed.data;
	const qc = getQueryClient();
	const assignee = qc.prefetch(assigneeQuery, { issueId: id });
	const comments = qc.prefetch(commentsQuery, { issueId: id });
	const issue = qc.prefetch(issueQuery, { id });

	return (
		<HydrationBoundary client={qc}>
			<IssuePage assignee={assignee} comments={comments} issue={issue} />
		</HydrationBoundary>
	);
}
