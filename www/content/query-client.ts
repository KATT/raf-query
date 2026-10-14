/**
 * Stub so Twoslash samples can `import { queryClientConfig } from "~/query-client.ts"`.
 * The Next.js guide's titled fence shows the real shape.
 */
import { QueryClient, type QueryClientConfig } from "@raf-query/react";
import { cache } from "react";

export const queryClientConfig = {
	defaults: { staleTime: 5000 },
} as const satisfies QueryClientConfig;

export const getQueryClient = cache(() => new QueryClient(queryClientConfig));
