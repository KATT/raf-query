export {
	hashKey,
	type QueryBehavior,
	type QueryFunctionContext,
	type QueryKey,
	type Thenable,
} from "@raf-query/core";
export * as QueryCache from "./cache.ts";
export { QueryClient, type QueryClientConfig } from "./client.ts";
export {
	type DataOf,
	type EnsuredQueryHandle,
	type ErrorOf,
	type InputArgs,
	type InputOf,
	type QueryFactory,
	type QueryFnResult,
	type QueryHandle,
	type QueryOptions,
	queryOptions,
	type ServicesOf,
} from "./options.ts";
export { QueryClientProvider, useQueryClient } from "./provider.tsx";
export {
	type QueryControls,
	useQuery,
	type UseEnsuredQueryResult,
	type UseQueryResult,
} from "./use-query.ts";
