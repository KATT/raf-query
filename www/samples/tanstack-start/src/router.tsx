import { QueryDevtools } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { Providers } from "./providers.tsx";
import { makeQueryClient } from "./query-client.ts";
import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
	const queryClient = makeQueryClient();
	const router = createRouter({
		context: { queryClient },
		defaultPreload: "intent",
		// The query cache decides what's fresh; loaders always run and dedupe there.
		defaultPreloadStaleTime: 0,
		routeTree,
		scrollRestoration: true,
		Wrap: (props) => (
			<Providers client={queryClient}>
				{props.children}
				{import.meta.env.DEV ? <QueryDevtools /> : null}
			</Providers>
		),
	});
	setupRouterIntegration({ queryClient, router });
	return router;
}
