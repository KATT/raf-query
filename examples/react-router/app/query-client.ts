import {
	applyStaleTime,
	type QueryTimeDefaults,
	queryTimeDefaults,
} from "@examples/db/types";
import { createQueryClient, recommended } from "@raf-query/react";
import { createContext } from "react-router";

/**
 * The app's query client, one per server request and one per browser tab.
 * It reads `defaults` live, so the settings menu changes `staleTime` by
 * mutating that object, without a new client.
 */
export function makeQueryClient(defaults: QueryTimeDefaults) {
	return createQueryClient({ defaults, plugins: recommended() });
}

/** A query client for one server request (or the browser tab), with the bar's stale time. */
export function createAppQueryClient(staleTime: number) {
	const queryDefaults = queryTimeDefaults(staleTime);
	// A server client leaves `gcTime` unset.
	const queryClient = makeQueryClient(queryDefaults);
	if (!queryClient.isServer) {
		applyStaleTime(queryDefaults, staleTime);
	}
	return { queryClient, queryDefaults };
}

/**
 * The request's query client. The root route's `middleware` sets it, so every
 * loader of one request shares a cache. Typed as the app's client, not the
 * bare `QueryClient`: loaders run the app's factories on it.
 */
export const queryClientContext =
	createContext<ReturnType<typeof makeQueryClient>>();
