import { DEFAULT_STALE_TIME, type QueryTimeDefaults } from "@examples/db/types";
import { createQueryClient, recommended } from "@raf-query/react";
import { cache } from "react";

/**
 * The app's query client. Server components and client components each
 * make theirs here, so both have the same plugins and run the same
 * factories. It reads `defaults` live, so the settings menu changes
 * `staleTime` by mutating that object, without a new client.
 */
export function makeQueryClient(defaults: QueryTimeDefaults) {
	return createQueryClient({ defaults, plugins: recommended() });
}

/**
 * The server components' query client, one per request. The browser
 * client's times come from the menu.
 */
export const getQueryClient = cache(() =>
	makeQueryClient({ staleTime: DEFAULT_STALE_TIME }),
);
