import { IssueId } from "@examples/db/types";
import { allKeyed } from "@raf-query/react";
import { HydrationBoundary } from "@raf-query/react/rsc";
import { notFound } from "next/navigation";
import { z } from "zod";

import { parseLoaderVerb, startQuery } from "~/loader-verb.ts";
import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

import { IssuePage } from "./_components/issue-page.tsx";

const IssueIdParam = z.coerce.number<string>().pipe(IssueId);

export default async function Page(props: {
	readonly params: Promise<{ issueId: string; verb: string }>;
}) {
	const params = await props.params;
	const verb = parseLoaderVerb(params.verb);
	const parsed = IssueIdParam.safeParse(params.issueId);
	if (!parsed.success) {
		notFound();
	}
	const id = parsed.data;
	const qc = getQueryClient();
	const handles = await allKeyed({
		assignee: startQuery(qc, verb, assigneeQuery, { issueId: id }),
		comments: startQuery(qc, verb, commentsQuery, { issueId: id }),
		issue: startQuery(qc, verb, issueQuery, { id }),
	});
	// `ensure` and `fetch` waited for the issue, so a missing one 404s
	// here. After `prefetch`, the page finds out when it reads the issue.
	if ("data" in handles.issue && handles.issue.data === null) {
		notFound();
	}

	return (
		<HydrationBoundary client={qc}>
			<IssuePage
				assignee={handles.assignee}
				comments={handles.comments}
				issue={handles.issue}
			/>
		</HydrationBoundary>
	);
}
