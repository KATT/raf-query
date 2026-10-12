import { IssueId } from "@examples/db/types";
import { HydrationBoundary } from "@raf-query/react/rsc";
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
	const comments = qc.prefetch(commentsQuery, { issueId: id });
	const issue = await qc.fetch(issueQuery, { id });
	// Client components can't call server actions during SSR, so the
	// assignee, known only once the issue loads, starts here.
	const assignee = qc.prefetch(userQuery, { id: issue.assigneeId });

	return (
		<HydrationBoundary client={qc}>
			<IssuePage
				assignee={assignee}
				comments={comments}
				issue={await qc.ensure(issueQuery, { id })}
			/>
		</HydrationBoundary>
	);
}
