import { IssueListInput } from "@examples/db/types";
import { allKeyed, dehydrate } from "@raf-query/experimental-svelte";

import { issueCountsQuery, issueListQuery } from "#lib/queries.ts";
import { createLoadClient } from "#lib/server/query-client.ts";
import { withRequest } from "#lib/settings.ts";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const input = IssueListInput.parse(
		Object.fromEntries(event.url.searchParams),
	);
	const queryClient = createLoadClient(event.cookies);
	const handles = await withRequest(event.request, () => {
		switch (event.params.verb) {
			// `prefetch` starts each query and returns its handle at once. The
			// page renders skeletons, and each pending query's data streams in
			// behind it.
			case "prefetch":
				return {
					counts: queryClient.prefetch(issueCountsQuery),
					issues: queryClient.prefetch(issueListQuery, input),
				};
			// `ensure` waits for data the cache doesn't have. Every request gets
			// a new client, so here it waits like `fetch`.
			case "ensure":
				return allKeyed({
					counts: queryClient.ensure(issueCountsQuery),
					issues: queryClient.ensure(issueListQuery, input),
				});
			case "fetch":
				return allKeyed({
					counts: queryClient.fetch(issueCountsQuery),
					issues: queryClient.fetch(issueListQuery, input),
				});
		}
	});
	return { ...handles, input, queries: dehydrate(queryClient) };
};
