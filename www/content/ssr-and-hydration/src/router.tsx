import {
	canDehydrate,
	QueryClient,
	QueryClientProvider,
} from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const queryClient = new QueryClient();
	const router = createRouter({
		routeTree,
		context: { queryClient },
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
			</QueryClientProvider>
		),
	});
	// #region filter
	setupRouterIntegration({
		dehydrateOptions: {
			filter: (query) => query.key[0] === "doc" && canDehydrate(query),
		},
		queryClient,
		router,
	});
	// #endregion
	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
