import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { Issues } from "./issues.ts";
import { routeTree } from "./routeTree.gen.ts";
import { latencyHeaders, readPrefetch, toDefaultPreload } from "./settings.ts";

export function getRouter() {
	// `QueryClient<Issues>`: queries' Effects get the RPC client from the layer.
	const queryClient = new QueryClient({
		defaults: { staleTime: 5000 },
		layer: Issues.layer(latencyHeaders),
	});
	const router = createRouter({
		context: { queryClient },
		defaultPreload: toDefaultPreload(readPrefetch()),
		// The query cache decides what's fresh; loaders always run and dedupe there.
		defaultPreloadStaleTime: 0,
		routeTree,
		scrollRestoration: true,
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
				<QueryDevtools />
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({
		// Failures keep their type across SSR, so `IssueNotFound` matches in the browser.
		dehydrateOptions: { keepErrors: true },
		queryClient,
		router,
	});
	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
