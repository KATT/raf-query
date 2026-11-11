import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	bindUseQueryClient,
} from "@raf-query/react";

import type { makeQueryClient } from "./query-client.ts";

export const queryOptions = bindQueryOptions<typeof makeQueryClient>();
export const infiniteQueryOptions =
	bindInfiniteQueryOptions<typeof makeQueryClient>();
export const useQueryClient = bindUseQueryClient<typeof makeQueryClient>();
