export * as Platform from "./platform.ts";
export * as Query from "./query.ts";
export * as QueryCache from "./cache.ts";
export {
	canDehydrate,
	type DehydratedQuery,
	type DehydratedState,
	type DehydrateOptions,
	dehydrateQuery,
	type HydrateOptions,
} from "./hydration.ts";
export { hashKey, matchesKey, type QueryKey } from "./key.ts";
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
	type LoadOptions,
	type PageFunctionContext,
	type PageOf,
	type QueryBehavior,
	type QueryFactory,
	type QueryFnResult,
	type QueryFunctionContext,
	type QueryHandle,
	type QueryOptions,
	queryOptions,
	type RetryPolicy,
} from "./options.ts";
export {
	QueryObserver,
	type QueryObserverOptions,
	type QueryObserverResult,
} from "./observer.ts";
export type { Thenable } from "./thenable.ts";
