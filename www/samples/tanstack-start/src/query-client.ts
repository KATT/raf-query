import { createQueryClient, recommended } from "@raf-query/react";

export function makeQueryClient() {
	return createQueryClient({ ...recommended(), staleTime: 30_000 });
}
