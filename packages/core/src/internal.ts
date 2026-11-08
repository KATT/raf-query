/**
 * The kernel, for `@raf-query/react` and other bindings. Not a public API:
 * it changes without notice between minor versions.
 */
export {
	type AnyFeature,
	type AnyLink,
	type ClientEvent,
	mount,
	systemClock,
} from "./client.ts";
export {
	type Entry,
	entryOf,
	type EntryState,
	fetchEntry,
	isEnabled,
	isInvalidated,
	isStale,
	remove,
	reset,
	subscribeEntry,
} from "./entry.ts";
export {
	type FocusRefetchMeta,
	type PollingMeta,
	type ReconnectRefetchMeta,
} from "./features.ts";
export type { TagsMeta } from "./groups.ts";
export { pageParamAfter } from "./infinite.ts";
export { type AnyFactory, type AnyTarget, hashKey } from "./keys.ts";
export type { RetryMeta } from "./links.ts";
export {
	isWaterfallHandle,
	type LoadRecord,
	loadsOf,
	startIfStale,
	readData,
} from "./load.ts";
export type { Decl, DefaultTypes, MetaOf, RootOf, RootTypes } from "./root.ts";
export { fulfilled, mapThenable, pending, rejected } from "./thenable.ts";
