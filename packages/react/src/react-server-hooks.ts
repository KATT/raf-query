/**
 * The hooks under the `react-server` export condition. Server components
 * can't read the client's cache: they start queries with `load` and send
 * them with `HydrationBoundary`. Each hook throws a message that says where
 * it belongs, instead of React's error about hooks or client references.
 * The types are the client components' hooks', so both builds type alike.
 */
import type { QueryClient, RootOf } from "@raf-query/core";

import type { useQueryClient as UseQueryClient } from "./provider.tsx";
import type { useInfiniteQuery as UseInfiniteQuery } from "./use-infinite-query.ts";
import type { useIsFetching as UseIsFetching } from "./use-is-fetching.ts";
import type { useQuery as UseQuery } from "./use-query.ts";

function clientOnly(name: string): () => never {
	return () => {
		throw new Error(
			`${name} reads in client components: move this into a file with "use client". Server components start queries with load() and send them with <HydrationBoundary>.`,
		);
	};
}

export const useQuery: typeof UseQuery = clientOnly("useQuery");

export const useInfiniteQuery: typeof UseInfiniteQuery =
	clientOnly("useInfiniteQuery");

export const useIsFetching: typeof UseIsFetching = clientOnly("useIsFetching");

export const useQueryClient: typeof UseQueryClient =
	clientOnly("useQueryClient");

/**
 * `bindUseQueryClient` runs at module level in a file server modules may
 * import too, so it works here and returns the throwing `useQueryClient`.
 */
export function bindUseQueryClient<T>(): () => QueryClient<RootOf<T>> {
	return useQueryClient;
}
