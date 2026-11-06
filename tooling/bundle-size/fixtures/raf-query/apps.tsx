import {
	createQueryClient,
	fetchEntry,
	load,
	prefetchEntry,
	QueryClientProvider,
} from "@raf-query/react";
import { dehydrate } from "@raf-query/react/hydration";
import { HydrationBoundary } from "@raf-query/react";
import { Suspense } from "react";

import { Comments } from "./comments.tsx";
import { EditTitle, IssueTitle } from "./issue.tsx";
import { commentsQuery, issueQuery } from "./queries.ts";

/** A factory, a loader-style `prefetch`, and a `useQuery` reader. No links, features or hydration. */
export async function queryApp() {
	const queryClient = createQueryClient();
	const [handles] = await load(queryClient, {
		issue: prefetchEntry(issueQuery, { id: 1 }),
	});
	return (
		<QueryClientProvider client={queryClient}>
			<Suspense fallback="Loading">
				<IssueTitle handle={handles.issue} />
			</Suspense>
		</QueryClientProvider>
	);
}

/** Plus a paged query with "Load more". */
export async function pagedApp() {
	const queryClient = createQueryClient();
	const [handles] = await load(queryClient, {
		comments: prefetchEntry(commentsQuery, { issueId: 1 }),
		issue: prefetchEntry(issueQuery, { id: 1 }),
	});
	return (
		<QueryClientProvider client={queryClient}>
			<Suspense fallback="Loading">
				<IssueTitle handle={handles.issue} />
				<Comments handle={handles.comments} />
			</Suspense>
		</QueryClientProvider>
	);
}

/** Plus a form action that writes and invalidates. */
export async function actionsApp() {
	const queryClient = createQueryClient();
	const [handles, data] = await load(queryClient, {
		comments: prefetchEntry(commentsQuery, { issueId: 1 }),
		issue: fetchEntry(issueQuery, { id: 1 }),
	});
	return (
		<QueryClientProvider client={queryClient}>
			<EditTitle issue={data.issue} />
			<Suspense fallback="Loading">
				<Comments handle={handles.comments} />
			</Suspense>
		</QueryClientProvider>
	);
}

/** The first app, rendered on a server and hydrated in the browser: both halves. */
export async function hydratedApp() {
	const server = createQueryClient();
	const [handles] = await load(server, {
		issue: prefetchEntry(issueQuery, { id: 1 }),
	});
	const state = dehydrate(server);
	const queryClient = createQueryClient();
	return (
		<QueryClientProvider client={queryClient}>
			<HydrationBoundary state={state}>
				<Suspense fallback="Loading">
					<IssueTitle handle={handles.issue} />
				</Suspense>
			</HydrationBoundary>
		</QueryClientProvider>
	);
}
