import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	bindUseQueryClient,
} from "@raf-query/react";

import type { makeQueryClient } from "./query-client.ts";

/**
 * raf-query's builders and `useQueryClient`, bound to the app's client:
 * factories take the options of its plugins, and run on it.
 */
export const queryOptions = bindQueryOptions<typeof makeQueryClient>();
export const infiniteQueryOptions =
	bindInfiniteQueryOptions<typeof makeQueryClient>();
export const useQueryClient = bindUseQueryClient<typeof makeQueryClient>();
