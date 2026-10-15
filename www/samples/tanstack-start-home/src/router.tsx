import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
	const queryClient = new QueryClient();
	const router = createRouter({
		context: { queryClient },
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		routeTree,
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({ queryClient, router });
	return router;
}
