import { queryOptions } from "@raf-query/react";

import { getBuild } from "./api";

export function buildQuery(input: { id: string }) {
	return queryOptions({
		queryKey: ["build", input.id],
		queryFn: () => getBuild(input.id),
	});
}
