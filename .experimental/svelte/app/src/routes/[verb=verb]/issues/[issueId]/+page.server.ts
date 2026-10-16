import { IssueId } from "@examples/db/types";
import { allKeyed, dehydrate } from "@raf-query/experimental-svelte";
import { error } from "@sveltejs/kit";

import { assigneeQuery, commentsQuery, issueQuery } from "#lib/queries.ts";
import { createLoadClient } from "#lib/server/query-client.ts";
import { withRequest } from "#lib/settings.ts";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const id = Number(event.params.issueId);
	if (!IssueId.safeParse(id).success) {
		error(404, "Not Found");
	}
	const queryClient = createLoadClient(event.cookies);
	if (event.params.verb === "prefetch") {
		// Starts each query and returns its handle at once. The page renders
		// skeletons, and finds out about a missing issue when it reads it.
		const handles = withRequest(event.request, () => ({
			assignee: queryClient.prefetch(assigneeQuery, { issueId: id }),
			comments: queryClient.prefetch(commentsQuery, { issueId: id }),
			issue: queryClient.prefetch(issueQuery, { id }),
		}));
		return { ...handles, id, queries: dehydrate(queryClient) };
	}
	const handles = await withRequest(event.request, () =>
		event.params.verb === "ensure"
			? allKeyed({
					assignee: queryClient.ensure(assigneeQuery, { issueId: id }),
					comments: queryClient.ensure(commentsQuery, { issueId: id }),
					issue: queryClient.ensure(issueQuery, { id }),
				})
			: allKeyed({
					assignee: queryClient.fetch(assigneeQuery, { issueId: id }),
					comments: queryClient.fetch(commentsQuery, { issueId: id }),
					issue: queryClient.fetch(issueQuery, { id }),
				}),
	);
	if (handles.issue.data === null) {
		error(404, "Not Found");
	}
	return { ...handles, id, queries: dehydrate(queryClient) };
};
