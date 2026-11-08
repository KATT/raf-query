import { group, queryOptions, type QueryClient } from "@raf-query/react";
import { canDehydrate } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";

const pushState = group("pushState");

/** Whether this browser gets a push when the post gets a new comment. */
declare function detectPushState(slug: string): Promise<"on" | "off">;

// #region browser-only-queries
export function pushStateQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: pushState(input.slug),
		queryFn: () => detectPushState(input.slug),
	});
}
// #endregion

declare const queryClient: QueryClient;

declare const router: Parameters<typeof setupRouterIntegration>[0]["router"];

// #region serialization
// Every demo query's key starts with this group.
const demos = group("demos");

setupRouterIntegration({
	dehydrateOptions: {
		filter: (entry) => entry.key[0] !== demos.path[0] && canDehydrate(entry),
	},
	queryClient,
	router,
});
// #endregion
