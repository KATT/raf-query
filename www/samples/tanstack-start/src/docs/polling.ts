import {
	createQueryClient,
	polling,
	queryOptions,
	recommended,
} from "@raf-query/react";
import { getBuild } from "~/api.ts";
import { builds } from "~/queries.ts";

// #region intro
export function buildQuery(input: { id: string }) {
	return queryOptions({
		queryKey: builds(input.id),
		queryFn: () => getBuild(input.id),
		meta: { refetchInterval: 2000 },
	});
}
// #endregion

// #region the-feature
const queryClient = createQueryClient({ features: [polling()] });
// or
const sameWithMore = createQueryClient({ ...recommended() });
// #endregion

// #region the-interval-per-input
export function buildLogQuery(input: { id: string; live: boolean }) {
	return queryOptions({
		queryKey: builds("log", input),
		queryFn: () => getBuild(input.id),
		meta: { refetchInterval: input.live ? 1000 : false },
	});
}
// #endregion
