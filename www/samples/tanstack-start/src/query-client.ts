import { createQueryClient, recommended } from "@raf-query/react";

export function makeQueryClient() {
	return createQueryClient({
		plugins: recommended(),
		defaults: { staleTime: 30_000 },
	});
}
