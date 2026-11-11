import { createRootRouteWithContext } from "@tanstack/react-router";

import type { makeQueryClient } from "~/query-client.ts";

export const Route = createRootRouteWithContext<{
	// The app's client: loaders run the app's factories on it.
	queryClient: ReturnType<typeof makeQueryClient>;
}>()({});
