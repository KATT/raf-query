import {
	createQueryClient,
	ensureEntry,
	load,
	prefetchEntry,
	type QueryClient,
	QueryClientProvider,
	recommended,
	useQuery,
} from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import {
	createRootRouteWithContext,
	createRoute,
	createRouter,
	Outlet,
} from "@tanstack/react-router";
import { Suspense } from "react";

import { Comments } from "./comments.tsx";
import { EditTitle } from "./issue.tsx";
import { commentsQuery, issueQuery } from "./queries.ts";

const rootRoute = createRootRouteWithContext<{
	readonly queryClient: QueryClient;
}>()({ component: Outlet });

async function loadIssue(args: {
	readonly context: { readonly queryClient: QueryClient };
	readonly params: { readonly issueId: string };
}) {
	const qc = args.context.queryClient;
	const id = Number(args.params.issueId);
	const [handles] = await load(qc, {
		comments: prefetchEntry(commentsQuery, { issueId: id }),
		issue: ensureEntry(issueQuery, { id }),
	});
	return handles;
}

const issueRoute = createRoute({
	component: IssuePage,
	getParentRoute: () => rootRoute,
	loader: loadIssue,
	path: "/issues/$issueId",
});

function IssuePage() {
	const data: Awaited<ReturnType<typeof loadIssue>> =
		issueRoute.useLoaderData();
	const [issue] = useQuery(issueQuery, data.issue);
	return (
		<article>
			<EditTitle issue={issue} />
			<Suspense fallback="Loading" key={issue.id}>
				<Comments handle={data.comments} />
			</Suspense>
		</article>
	);
}

/** The Start example's setup: recommended behaviors, loaders start queries, the integration streams them. */
export function createAppRouter() {
	const queryClient = createQueryClient({ ...recommended(), staleTime: 5000 });
	const router = createRouter({
		context: { queryClient },
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		routeTree: rootRoute.addChildren([issueRoute]),
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({ queryClient, router });
	return router;
}
