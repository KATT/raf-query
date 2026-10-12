import { IssueId } from "@examples/db/types";
import { HydrationBoundary } from "@raf-query/react/rsc";
import { Option, Schema } from "effect";
import { notFound } from "next/navigation";

import { IssuePage } from "~/components/issue-page.tsx";
import { commentsQuery, issueQuery, userQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

const IssueIdParam = Schema.FiniteFromString.pipe(Schema.decodeTo(IssueId));

export default async function Page(props: {
	readonly params: Promise<{ issueId: string }>;
}) {
	const params = await props.params;
	const id = Option.getOrElse(
		Schema.decodeUnknownOption(IssueIdParam)(params.issueId),
		() => notFound(),
	);
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
				issue={qc.prefetch(issueQuery, { id })}
			/>
		</HydrationBoundary>
	);
}
