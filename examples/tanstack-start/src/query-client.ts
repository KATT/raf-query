import type { QueryTimeDefaults } from "@examples/db/types";
import { createQueryClient, recommended } from "@raf-query/react";

/**
 * The app's query client, one per server request and one per browser tab.
 * It reads `defaults` live, so the settings menu changes `staleTime` by
 * mutating that object, without a new client.
 */
export function makeQueryClient(defaults: QueryTimeDefaults) {
	return createQueryClient({ defaults, plugins: recommended() });
}
