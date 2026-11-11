import {
	bindQueryOptions,
	bindUseQueryClient,
	createQueryClient,
	recommended,
} from "@raf-query/react";

/** A demo's client unless it makes its own: the parts the guides assume. */
export function createDemoClient() {
	return createQueryClient({ parts: recommended() });
}

/** A client with `recommended()`'s parts: what every demo runs on. */
export type DemoClient = ReturnType<typeof createDemoClient>;

/** `queryOptions` that takes the options `recommended()`'s parts declare. */
export const queryOptions = bindQueryOptions<typeof createDemoClient>();

/** The session's client, typed with its parts. */
export const useQueryClient = bindUseQueryClient<typeof createDemoClient>();
