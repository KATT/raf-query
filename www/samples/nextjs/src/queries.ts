import { queryOptions } from "@raf-query/react";

import { getPost, listComments, listIssues } from "./api.ts";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
	});
}

export function commentsQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["comments", input.slug],
		queryFn: () => listComments(input.slug),
	});
}

export function issueListQuery(input: { status: "open" | "done" }) {
	return queryOptions({
		queryKey: ["issues", input],
		queryFn: () => listIssues(input),
	});
}

// #region api-fetch
import { apiFetch } from "#api-fetch";

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: (context) =>
			apiFetch(`/api/issues/${input.id}`, { signal: context.signal }).then(
				(response) => response.json(),
			),
	});
}
// #endregion
