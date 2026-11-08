import {
	canDehydrate,
	createQueryClient,
	QueryClientProvider,
	QueryDevtools,
	retry,
} from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { NotFound } from "./components/not-found.tsx";
import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
	// Pages and demo code only change with a deploy: nothing to refetch on
	// focus, and no actions to invalidate after.
	const queryClient = createQueryClient({ links: [retry()] });
	const router = createRouter({
		context: { queryClient },
		defaultNotFoundComponent: NotFound,
		// Hovering a link loads the page's content chunk into the query cache,
		// so the click renders without waiting.
		defaultPreload: "intent",
		// The query cache decides what's fresh; loaders always run and dedupe there.
		defaultPreloadStaleTime: 0,
		routeTree,
		scrollRestoration: true,
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
				{import.meta.env.DEV ? (
					<QueryDevtools buttonPosition="bottom-left" />
				) : null}
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({
		// Demo entries hold components, which can't be serialized; the browser
		// loads their chunks itself.
		dehydrateOptions: {
			filter: (entry) => entry.key[0] === "doc" && canDehydrate(entry),
		},
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
