export {
	type Clock,
	createQueryClient,
	type Operation,
	type Part,
	part,
	type QueryClient,
	type QueryClientConfig,
} from "./client.ts";
export { abortError } from "./entry.ts";
export {
	type FocusRefetch,
	focusRefetch,
} from "./features/focus-refetch/focus-refetch.ts";
export {
	type ReconnectRefetch,
	reconnectRefetch,
} from "./features/reconnect-refetch/reconnect-refetch.ts";
export { type Polling, polling } from "./features/polling/polling.ts";
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
export {
	fetchNextPage,
	fetchPreviousPage,
	hasNextPage,
	hasPreviousPage,
	type PageControls,
	type PageDirection,
	type PageState,
} from "./infinite/paging.ts";
export { type Group, group, type QueryKey } from "./keys/keys.ts";
export type { QueryInfo, Target } from "./keys/targets.ts";
export { type Retry, retry, type RetryOptions } from "./links/retry/retry.ts";
export { QueryTimeoutError, timeout } from "./links/timeout/timeout.ts";
export {
	load,
	type Loaded,
	type LoadEntry,
	type LoadEntryOptions,
	prefetch,
	type QueryHandle,
	revalidate,
	skipToken,
	swr,
	waterfallHandle,
} from "./load.ts";
export {
	bindQueryOptions,
	type CoreOptions,
	type DataOf,
	type InputOf,
	type InfiniteQueryFactory,
	type OptionsOf,
	type QueryFactory,
	type SingleQueryFactory,
	type QueryFunctionContext,
	type QueryOptions,
	type QueryOptionsBuilder,
	queryOptions,
	type StreamOptions,
} from "./options.ts";
export type { Optional, RootOf } from "./root.ts";
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
