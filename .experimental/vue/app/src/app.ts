import { applyStaleTime, queryTimeDefaults } from "@examples/db/types";
import { QueryClient, QueryPlugin } from "@raf-query/experimental-vue";
import { createSSRApp, ref } from "vue";

import App from "./App.vue";
import { prefetchKey } from "./lib/prefetch.ts";
import type { Settings } from "./lib/settings.ts";
import { createAppRouter, type InitialLoad, navigatingKey } from "./router.ts";

/** One app per request on the server, and one in the browser. */
export function createApp(options: {
	readonly initial?: InitialLoad | undefined;
	readonly isServer: boolean;
	readonly settings: Settings;
}) {
	// The cache reads `queryDefaults` live, and the settings bar changes it.
	const queryDefaults = queryTimeDefaults(options.settings.staleTime);
	const queryClient = new QueryClient({
		defaults: queryDefaults,
		isServer: options.isServer,
	});
	// A server client leaves `gcTime` unset.
	if (!queryClient.isServer) {
		applyStaleTime(queryDefaults, options.settings.staleTime);
	}
	const routing = createAppRouter(queryClient, options.initial);
	const app = createSSRApp(App, { queryDefaults, settings: options.settings })
		.use(QueryPlugin, { client: queryClient })
		.use(routing.router)
		.provide(navigatingKey, routing.navigating)
		.provide(prefetchKey, ref(options.settings.prefetch));
	return { app, queryClient, router: routing.router };
}
