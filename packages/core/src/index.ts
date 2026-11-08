export {
	type Clock,
	createQueryClient,
	type Feature,
	feature,
	type Link,
	link,
	type Operation,
	type QueryClient,
	type QueryClientConfig,
} from "./client.ts";
export { abortError, QueryDisabledError } from "./entry.ts";
export {
	type Fail,
	fail,
	failOf,
	isFail,
	isQueryFailure,
	QueryFailure,
	type Result,
} from "./fail.ts";
export { focusRefetch } from "./features/focus-refetch/focus-refetch.ts";
export { reconnectRefetch } from "./features/reconnect-refetch/reconnect-refetch.ts";
export { polling } from "./features/polling/polling.ts";
export {
	canDehydrate,
	type DehydratedEntry,
	type DehydratedResult,
	type DehydratedState,
	type DehydratedStream,
	type DehydrateOptions,
	dehydrate,
	dehydrateStream,
	hydrate,
	RedactedError,
} from "./hydration/hydration.ts";
export {
	bindInfiniteQueryOptions,
	type InfiniteData,
	type InfiniteQueryFunctionContext,
	type InfiniteQueryOptions,
	type InfiniteQueryOptionsBuilder,
	infiniteQueryOptions,
} from "./infinite/infinite.ts";
export { type Group, group, type QueryKey } from "./keys/keys.ts";
export type { QueryInfo, Target } from "./keys/targets.ts";
export { retry, type RetryOptions } from "./links/retry/retry.ts";
export { QueryTimeoutError, timeout } from "./links/timeout/timeout.ts";
export {
	load,
	type Loaded,
	type LoadEntry,
	type LoadEntryOptions,
	prefetch,
	type QueryHandle,
	revalidate,
	swr,
	waterfallHandle,
} from "./load.ts";
export {
	bindQueryOptions,
	type DataOf,
	type ErrorOf,
	type InputOf,
	type InfiniteQueryFactory,
	type QueryFactory,
	type SingleQueryFactory,
	type QueryFunctionContext,
	type QueryOptions,
	type QueryOptionsBuilder,
	queryOptions,
	type StreamOptions,
} from "./options.ts";
export type { QueryMeta } from "./root.ts";
export { type Recommended, recommended } from "./presets.ts";
export type { Thenable } from "./thenable.ts";
export {
	type ClientFor,
	getData,
	invalidateAll,
	invalidateMany,
	invalidateOne,
	isFetching,
	type PartialInput,
	removeAll,
	removeMany,
	removeOne,
	resetAll,
	resetMany,
	resetOne,
	setData,
} from "./verbs.ts";
