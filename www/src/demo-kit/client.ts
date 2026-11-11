import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	bindUseQueryClient,
	createQueryClient,
	recommended,
} from "@raf-query/react";

/** A demo's client unless it makes its own: the plugins the guides assume. */
export function createDemoClient() {
	return createQueryClient({ plugins: recommended() });
}

/** A client with `recommended()`'s plugins: what every demo runs on. */
export type DemoClient = ReturnType<typeof createDemoClient>;

/** `queryOptions` for the demos: it takes the options `recommended()`'s plugins declare. */
export const queryOptions = bindQueryOptions<typeof createDemoClient>();

/** `infiniteQueryOptions` for the demos, bound the same way. */
export const infiniteQueryOptions =
	bindInfiniteQueryOptions<typeof createDemoClient>();

/** The session's client, typed with its plugins. */
export const useQueryClient = bindUseQueryClient<typeof createDemoClient>();
