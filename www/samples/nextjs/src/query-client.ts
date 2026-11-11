import { createQueryClient, recommended } from "@raf-query/react";
import { cache } from "react";

export function makeQueryClient() {
	return createQueryClient({
		parts: recommended(),
		defaults: { staleTime: 5000 },
	});
}

/** The server components' client, one per request. */
export const getQueryClient = cache(makeQueryClient);
