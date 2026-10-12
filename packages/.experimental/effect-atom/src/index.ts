export {
	type DataOf,
	type EnsuredQueryHandle,
	type ErrorOf,
	hashKey,
	type InputArgs,
	type InputOf,
	type QueryBehavior,
	type QueryHandle,
	type QueryKey,
	type QueryOptions,
	queryOptions,
	type Thenable,
} from "@raf-query/core";
export {
	QueryClient,
	type QueryClientConfig,
	type QueryFactory,
	type Updater,
} from "./client.ts";
export { QueryClientProvider, useQueryClient } from "./provider.tsx";
export {
	type QueryControls,
	useQuery,
	type UseEnsuredQueryResult,
	type UseQueryResult,
} from "./use-query.ts";
