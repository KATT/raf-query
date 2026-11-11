/**
 * The hooks under the `react-server` export condition. Server components
 * can't read the client's cache: they start queries with `load` and send
 * them with `HydrationBoundary`. Each hook throws a message that says where
 * it belongs, instead of React's error about hooks or client references.
 * The types are the client components' hooks', so both builds type alike.
 */
import type { QueryClient } from "@raf-query/core";
import type { RootOf } from "@raf-query/core/internal";

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

/**
 * `useQuery` in a server component: throws, since hooks belong in client
 * components.
 *
 * @see https://raf-query.katt.dev/docs/react-server-components
 */
export const useQuery: typeof UseQuery = /* @__PURE__ */ clientOnly("useQuery");

/**
 * `useInfiniteQuery` in a server component: throws, since hooks belong in client
 * components.
 *
 * @see https://raf-query.katt.dev/docs/react-server-components
 */
export const useInfiniteQuery: typeof UseInfiniteQuery =
	/* @__PURE__ */ clientOnly("useInfiniteQuery");

/**
 * `useIsFetching` in a server component: throws, since hooks belong in client
 * components.
 *
 * @see https://raf-query.katt.dev/docs/react-server-components
 */
export const useIsFetching: typeof UseIsFetching =
	/* @__PURE__ */ clientOnly("useIsFetching");

/**
 * `useQueryClient` in a server component: throws, since hooks belong in client
 * components.
 *
 * @see https://raf-query.katt.dev/docs/react-server-components
 */
export const useQueryClient: typeof UseQueryClient =
	/* @__PURE__ */ clientOnly("useQueryClient");

/**
 * `bindUseQueryClient` runs at module level in a file server modules may
 * import too, so it works here and returns the throwing `useQueryClient`.
 *
 * @see https://raf-query.katt.dev/docs/plugins#typing-options-by-the-client
 */
export function bindUseQueryClient<T>(): () => QueryClient<RootOf<T>> {
	// SAFETY: the app binds this hook to the client its provider is given.
	return useQueryClient as () => QueryClient<RootOf<T>>;
}
