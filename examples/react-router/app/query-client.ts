import { applyStaleTime, queryTimeDefaults } from "@examples/db/types";
import {
	createQueryClient,
	type QueryClient,
	recommended,
} from "@raf-query/react";
import { createContext } from "react-router";

/** A query client for one server request (or the browser tab), with the bar's stale time. */
export function createAppQueryClient(staleTime: number) {
	const queryDefaults = queryTimeDefaults(staleTime);
	// The client reads its defaults live, so the settings panel can change
	// `staleTime` without a new client. A server client leaves `gcTime` unset.
	const queryClient = createQueryClient({
		defaults: queryDefaults,
		parts: recommended(),
	});
	if (!queryClient.isServer) {
		applyStaleTime(queryDefaults, staleTime);
	}
	return { queryClient, queryDefaults };
}

/**
 * The request's query client. The root route's `middleware` sets it, so every
 * loader of one request shares a cache.
 */
export const queryClientContext = createContext<QueryClient>();
