import { QueryClient } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
	const queryClient = new QueryClient();
	const router = createRouter({ routeTree, context: { queryClient } });
	setupRouterIntegration({ router, queryClient });
	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
