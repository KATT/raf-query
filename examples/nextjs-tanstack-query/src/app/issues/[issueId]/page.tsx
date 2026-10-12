import { IssueId } from "@examples/db/types";
import { ensureData, prefetch } from "@raf-query/tanstack-react-query";
import { HydrationBoundary } from "@raf-query/tanstack-react-query/rsc";
import { notFound } from "next/navigation";
import { z } from "zod";

import { IssuePage } from "~/components/issue-page.tsx";
import { commentsQuery, issueQuery, userQuery } from "~/queries.ts";
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
	const comments = prefetch(qc, commentsQuery, { issueId: id });
	const issue = await ensureData(qc, issueQuery, { id });
	// Client components can't call server actions during SSR, so the
	// assignee, known only once the issue loads, starts here.
	const assignee = prefetch(qc, userQuery, { id: issue.assigneeId });

	return (
		<HydrationBoundary client={qc}>
			<IssuePage
				assignee={assignee}
				comments={comments}
				issue={prefetch(qc, issueQuery, { id })}
			/>
		</HydrationBoundary>
	);
}
