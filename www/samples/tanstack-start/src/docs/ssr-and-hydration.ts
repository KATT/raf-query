import { canDehydrate, group, load, prefetch } from "@raf-query/react";
import { queryOptions } from "~/raf.ts";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import type { makeQueryClient } from "~/query-client.ts";

const pushState = group("pushState");

/** Whether this browser gets a push when the post gets a new comment. */
declare function detectPushState(slug: string): Promise<"on" | "off">;

// #region browser-only-queries
export function pushStateQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: pushState(input.slug),
		queryFn: () => detectPushState(input.slug),
		// Only the browser can tell: the server never runs it.
		ssr: false,
	});
}
// #endregion

declare const queryClient: ReturnType<typeof makeQueryClient>;

// #region browser-only-loader
export async function loader(slug: string) {
	const [handles] = await load(queryClient, {
		push: prefetch(pushStateQuery, { slug }),
	});
	return handles;
}
// #endregion browser-only-loader

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
