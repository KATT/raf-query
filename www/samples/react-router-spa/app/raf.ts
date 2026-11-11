import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	bindUseQueryClient,
} from "@raf-query/react";

import type { queryClient } from "./query-client.ts";

export const queryOptions = bindQueryOptions<typeof queryClient>();
export const infiniteQueryOptions =
	bindInfiniteQueryOptions<typeof queryClient>();
export const useQueryClient = bindUseQueryClient<typeof queryClient>();
