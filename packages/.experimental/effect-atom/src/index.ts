export {
	hashKey,
	type QueryBehavior,
	type QueryFunctionContext,
	type QueryKey,
	type Thenable,
} from "@raf-query/core";
export * as QueryCache from "./cache.ts";
export {
	dehydrate,
	hydrate,
	QueryClient,
	type QueryClientConfig,
} from "./client.ts";
export type {
	DehydratedQuery,
	DehydratedState,
	DehydrateOptions,
	HydrateOptions,
} from "./hydration.ts";
export {
	type AnyQueryOptions,
	type DataOf,
	type EnsuredQueryHandle,
	type ErrorOf,
	type InfiniteData,
	type InfiniteQueryOptions,
	infiniteQueryOptions,
	type InputArgs,
	type InputOf,
	type IsPaged,
	type LoadArgs,
	type LoadOptions,
	type PageFunctionContext,
	type QueryFactory,
	type QueryFnResult,
	type QueryHandle,
	type QueryOptions,
	queryOptions,
	type ServicesOf,
} from "./options.ts";
export { QueryClientProvider, useQueryClient } from "./provider.tsx";
export {
	type PagingControls,
	type QueryControls,
	useQuery,
	type UseEnsuredQueryResult,
	type UseQueryOptions,
	type UseQueryResult,
} from "./use-query.ts";
