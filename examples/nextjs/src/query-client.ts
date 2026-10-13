import { type QueryClientConfig, createQueryClient } from "@raf-query/react";
import { cache } from "react";

export const queryClientConfig = {
	defaults: { staleTime: 5000 },
} as const satisfies QueryClientConfig;

/** The server components' query client, one per request. */
export const getQueryClient = cache(() => createQueryClient(queryClientConfig));
