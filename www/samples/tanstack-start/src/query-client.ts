import { createQueryClient, recommended } from "@raf-query/react";

export function makeQueryClient() {
	return createQueryClient({
		parts: recommended(),
		defaults: { staleTime: 30_000 },
	});
}
