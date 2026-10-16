import { IssueId, IssueListInput, type LoaderVerb } from "@examples/db/types";
import { allKeyed, type QueryClient } from "@raf-query/experimental-vue";
import type { RouteLocationNormalized } from "vue-router";

import {
	assigneeQuery,
	commentsQuery,
	issueCountsQuery,
	issueListQuery,
	issueQuery,
} from "./lib/queries.ts";

/** The parts of a location a loader reads. */
export type LoaderLocation = Pick<RouteLocationNormalized, "params" | "query">;

/** What a loader returns for a URL the route can't show: the not-found page. */
export const notFound = Symbol("not found");

/**
 * Starts a route's queries under the URL's loader verb, before the route
 * renders. Runs on the server for the first request and in the browser for
 * every navigation after it, and for link prefetching under `prefetch`.
 */
export type Loader = (
	queryClient: QueryClient,
	to: LoaderLocation,
	verb: LoaderVerb,
) => Promise<IssuesData | IssueData | typeof notFound>;

function listInput(to: LoaderLocation) {
	return IssueListInput.parse(
		Object.fromEntries(
			Object.entries(to.query).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		),
	);
}

export async function issuesLoader(
	queryClient: QueryClient,
	to: LoaderLocation,
	verb: LoaderVerb,
) {
	const input = listInput(to);
	switch (verb) {
		// `prefetch` starts each query and returns its handle at once. The page
		// renders skeletons until each query's data lands.
		case "prefetch":
			return {
				counts: queryClient.prefetch(issueCountsQuery),
				input,
				issues: queryClient.prefetch(issueListQuery, input),
			};
		// `ensure` waits for data the cache doesn't have. Cached data, even
		// stale, comes back at once and refetches behind the page.
		case "ensure": {
			const handles = await allKeyed({
				counts: queryClient.ensure(issueCountsQuery),
				issues: queryClient.ensure(issueListQuery, input),
			});
			return { ...handles, input };
		}
		case "fetch": {
			const handles = await allKeyed({
				counts: queryClient.fetch(issueCountsQuery),
				issues: queryClient.fetch(issueListQuery, input),
			});
			return { ...handles, input };
		}
	}
}

export type IssuesData = Awaited<ReturnType<typeof issuesLoader>>;

export async function issueLoader(
	queryClient: QueryClient,
	to: LoaderLocation,
	verb: LoaderVerb,
) {
	const id = Number(to.params["issueId"]);
	if (!IssueId.safeParse(id).success) {
		return notFound;
	}
	if (verb === "prefetch") {
		// The page renders skeletons, and finds out about a missing issue when
		// it reads it.
		return {
			assignee: queryClient.prefetch(assigneeQuery, { issueId: id }),
			comments: queryClient.prefetch(commentsQuery, { issueId: id }),
			id,
			issue: queryClient.prefetch(issueQuery, { id }),
		};
	}
	const handles = await (verb === "ensure"
		? allKeyed({
				assignee: queryClient.ensure(assigneeQuery, { issueId: id }),
				comments: queryClient.ensure(commentsQuery, { issueId: id }),
				issue: queryClient.ensure(issueQuery, { id }),
			})
		: allKeyed({
				assignee: queryClient.fetch(assigneeQuery, { issueId: id }),
				comments: queryClient.fetch(commentsQuery, { issueId: id }),
				issue: queryClient.fetch(issueQuery, { id }),
			}));
	if (handles.issue.data === null) {
		return notFound;
	}
	return { ...handles, id };
}

export type IssueData = Exclude<
	Awaited<ReturnType<typeof issueLoader>>,
	typeof notFound
>;
