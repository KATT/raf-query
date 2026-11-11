/**
 * The kernel, for `@raf-query/react` and other bindings. Not a public API:
 * it changes without notice between minor versions.
 */
export {
	type AnyPlugin,
	type ClientEvent,
	mount,
	systemClock,
} from "./client.ts";
export {
	type Entry,
	entryOf,
	type EntryState,
	fetchEntry,
	isBrowserOnly,
	isInvalidated,
	isStale,
	remove,
	reset,
	subscribeEntry,
} from "./entry.ts";
export { fetchPage, pageState } from "./infinite/paging.ts";
export { type AnyFactory, hashKey } from "./keys/keys.ts";
export type { AnyTarget } from "./keys/targets.ts";
export {
	isWaterfallHandle,
	type LoadRecord,
	loadsOf,
	startIfStale,
	readData,
} from "./load.ts";
export type {
	Decl,
	NoPlugins,
	Root,
	RootOf,
	RootOfPlugins,
	RootTypes,
	SetsOf,
} from "./root.ts";
export { fulfilled, mapThenable, pending, rejected } from "./thenable.ts";
