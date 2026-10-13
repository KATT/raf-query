/**
 * The query cache, as a data type with functions: `make` builds one, and
 * every verb takes it first. Waiting verbs return promises; the rest are
 * synchronous. `QueryClient` in `@raf-query/react` wraps one with methods,
 * and `@raf-query/core/effect` has it as an Effect service.
 *
 * Nothing here imports Effect. A `queryFn` that returns an Effect runs with
 * `config.services` (`fromLayer` / `fromContext` from
 * `@raf-query/core/effect`).
 */
import { unsafeCast } from "./cast.ts";
import { type Clock, systemClock } from "./clock.ts";
import * as Entry from "./entry.ts";
import {
	dehydrateEntries,
	type DehydratedState,
	type DehydratedStream,
	type DehydrateOptions,
	dehydrateStream as streamEntries,
	hydrateEntries,
	type HydrateOptions,
} from "./hydration.ts";
import { hashKey, matchesKey, type QueryKey } from "./key.ts";
import {
	type DataOf,
	type EnsuredQueryHandle,
	type InputArgs,
	type InputOf,
	type LoadOptions,
	optionsFor,
	type QueryBehavior,
	type QueryFactory,
	type QueryHandle,
} from "./options.ts";
import { type Outcome, succeeded, unwrap } from "./outcome.ts";
import { globalPlatform, type Platform } from "./platform.ts";
import { hasProperty, isFunction } from "./predicate.ts";
import type * as Query from "./query.ts";
import type { EffectServices } from "./request.ts";

export const TypeId = "~@raf-query/core/QueryCache";

export type TypeId = typeof TypeId;

export interface Config {
	/** Time for the cache's timers. Default: `Date.now` and `setTimeout`. */
	readonly clock?: Clock;
	/** Defaults for every query; a factory's own options win. */
	readonly defaults?: QueryBehavior;
	/**
	 * Whether this cache runs on the server. Default: the platform's.
	 * Server caches don't retry, never garbage-collect, skip stale timers, and
	 * reuse cached data in `prefetch` / `ensure` / `fetch` instead of
	 * revalidating it, unless `invalidate` marked it.
	 */
	readonly isServer?: boolean;
	/** The page to watch for focus and reconnects. Default: the global one. */
	readonly platform?: Platform;
	/**
	 * Runs `queryFn`s that return an Effect, with the services they need:
	 * `fromLayer(layer)` or `fromContext(context)` from
	 * `@raf-query/core/effect`. `dispose` releases them.
	 */
	readonly services?: EffectServices;
}

/** Emitted to {@link subscribe}rs for every cache change. */
export type Event =
	| {
			readonly query: Query.Query;
			/** `observers`: a reader subscribed or unsubscribed. */
			readonly type: "added" | "observers" | "removed" | "updated";
	  }
	| {
			/** A request failed (after retries), with this error. */
			readonly error: unknown;
			readonly query: Query.Query;
			readonly type: "failed";
	  };

/**
 * Selects cache entries: by key prefix (exact key with `exact`), then by
 * `predicate`. Without `queryKey` every key matches, so `{}` selects the
 * whole cache.
 */
export interface Filter {
	readonly exact?: boolean;
	/**
	 * Keep only entries this returns `true` for; runs after key matching.
	 * `query.handle.input` is the input of the latest factory call, and stays
	 * `undefined` for an entry only hydrated so far; match on `query.key` to
	 * include those.
	 */
	readonly predicate?: (query: Query.Query) => boolean;
	readonly queryKey?: QueryKey;
}

/** `ensure` / `fetch` arguments: the input, then load options for paged factories. */
export type LoadArgs<TFactory extends QueryFactory> =
	| InputArgs<TFactory>
	| [input: InputOf<TFactory>, options: LoadOptions<TFactory>];

/** The entries `invalidate`, `reset` and `remove` act on: one factory call, or a filter. */
export type Target<TFactory extends QueryFactory> =
	| [factory: TFactory, ...args: InputArgs<TFactory>]
	| [filter: Filter];

/**
 * A new value, or a function of the current one. `previous` is `undefined`
 * both with no data and with `undefined` data.
 */
export type Updater<TData> = TData | ((previous: TData | undefined) => TData);

/** A cache built by {@link make}. Its entries and timers are internal. */
export interface QueryCache {
	readonly isServer: boolean;
	readonly [TypeId]: TypeId;
}

interface Impl extends Entry.CacheState, QueryCache {
	/** Open {@link mount}s; they share one platform subscription. */
	mounts: number;
	unsubscribePlatform: (() => void) | undefined;
}

export function isQueryCache(value: unknown): value is QueryCache {
	return hasProperty(value, TypeId);
}

/** The engine state behind `cache`, for this package's other modules. */
export function stateOf(cache: QueryCache): Entry.CacheState {
	return implOf(cache);
}

function implOf(cache: QueryCache): Impl {
	// SAFETY: `make` creates every value that carries `TypeId`, and the public
	// `QueryCache` type is how they leave this module.
	return unsafeCast<Impl>(cache);
}

function isUpdateFunction<TData>(
	updater: Updater<TData>,
): updater is (previous: TData | undefined) => TData {
	return isFunction(updater);
}

function typed<TFactory extends QueryFactory>(
	entry: Entry.Entry,
): Query.Of<TFactory> {
	// SAFETY: an entry's hash comes from its factory's `queryKey`, and only
	// that factory's `queryFn` (or data written through the same factory)
	// fills it, so its data and errors have the factory's types.
	return unsafeCast<Query.Of<TFactory>>(entry);
}

function handleOf<TFactory extends QueryFactory>(
	entry: Entry.Entry,
): QueryHandle<TFactory> {
	// SAFETY: `entry.handle.input` is the input of the latest call through
	// this factory, which `InputArgs<TFactory>` type-checked.
	return unsafeCast<QueryHandle<TFactory>>(entry.handle);
}

function dataOf<TFactory extends QueryFactory>(
	entry: Entry.Entry,
): DataOf<TFactory> {
	// SAFETY: only called when `hasData` is set, so `data` came from this
	// factory's queryFn or Entry.setData, even when its type includes `undefined`.
	return unsafeCast<DataOf<TFactory>>(entry.state.data);
}

function keyMatcher(filter: Filter): (entry: Entry.Entry) => boolean {
	const prefix = filter.queryKey;
	if (prefix === undefined) {
		return () => true;
	}
	if (filter.exact) {
		const hash = hashKey(prefix);
		return (entry) => entry.hash === hash;
	}
	return (entry) => matchesKey(entry.key, prefix);
}

/** Build a cache. */
export function make(config: Config = {}): QueryCache {
	const platform = config.platform ?? globalPlatform;
	const cache: Impl = {
		clock: config.clock ?? systemClock,
		closed: false,
		defaults: config.defaults ?? {},
		entries: new Map(),
		isServer: config.isServer ?? platform.isServer,
		listeners: new Set(),
		mounts: 0,
		platform,
		services: config.services,
		[TypeId]: TypeId,
		unsubscribePlatform: undefined,
	};
	return cache;
}

/** The entry for `key`, created if missing. */
export function entryFor(cache: QueryCache, key: QueryKey): Entry.Entry {
	const state = implOf(cache);
	const hash = hashKey(key);
	const existing = state.entries.get(hash);
	if (existing) {
		return existing;
	}
	const entry = Entry.make(state, key, hash);
	state.entries.set(hash, entry);
	Entry.emit(state, { query: entry, type: "added" });
	return entry;
}

/** The entry for a factory call, created if missing, with its latest options. */
export function build(
	cache: QueryCache,
	factory: QueryFactory,
	input: unknown,
): Entry.Entry {
	const options = optionsFor(factory, input);
	const entry = entryFor(cache, options.queryKey);
	Entry.setOptions(entry, options, input);
	return entry;
}

/** The entry for a factory call, if cached. */
export function find(
	cache: QueryCache,
	factory: QueryFactory,
	input: unknown,
): Entry.Entry | undefined {
	return implOf(cache).entries.get(
		hashKey(optionsFor(factory, input).queryKey),
	);
}

function match<TFactory extends QueryFactory>(
	cache: QueryCache,
	target: Target<TFactory>,
): Array<Entry.Entry> {
	const entries = implOf(cache).entries;
	// SAFETY: a target is a factory and its input, or a lone filter;
	// `InputArgs` only narrows the input's type.
	const [first, input] =
		unsafeCast<readonly [QueryFactory | Filter, unknown?]>(target);
	if (isFunction(first)) {
		const entry = find(cache, first, input);
		return entry ? [entry] : [];
	}
	const keyMatches = keyMatcher(first);
	return [...entries.values()].filter(
		(entry) => keyMatches(entry) && (first.predicate?.(entry) ?? true),
	);
}

/**
 * Background refetch of cached data a verb reuses. A server cache renders
 * once, so a refetch there could only duplicate a request whose result is
 * never shown; it refetches only what `invalidate` marked.
 */
function revalidate(entry: Entry.Entry) {
	const state = entry.state;
	const wanted = entry.cache.isServer
		? state.isInvalidated
		: Entry.isStaleUnsafe(entry);
	if (!state.isFetching && wanted) {
		Entry.start(entry);
	}
}

/**
 * Waits for an entry's data on a cache miss. Cached data returns at once,
 * and revalidates in the background (see `revalidate`).
 */
export function load(
	entry: Entry.Entry,
	pages: number | undefined,
): Promise<Outcome> {
	if (!entry.state.hasData) {
		return Entry.fetch(entry, { pages });
	}
	revalidate(entry);
	return Promise.resolve(succeeded(entry.state.data));
}

/** Start an entry's request without waiting, unless fresh data is cached. */
export function startPrefetch(entry: Entry.Entry): void {
	if (entry.state.hasData) {
		revalidate(entry);
	} else {
		Entry.start(entry);
	}
}

/** Every entry. */
export function all(cache: QueryCache): ReadonlyArray<Query.Query> {
	return [...implOf(cache).entries.values()];
}

/** Drop every entry and abort their requests. */
export function clear(cache: QueryCache): void {
	for (const entry of implOf(cache).entries.values()) {
		Entry.remove(entry);
	}
}

/**
 * Close the cache: drop every entry, abort their requests, stop watching
 * the platform, and release `config.services`. Resolves once those are
 * released.
 */
export function dispose(cache: QueryCache): Promise<void> {
	const state = implOf(cache);
	clear(cache);
	state.closed = true;
	state.unsubscribePlatform?.();
	state.unsubscribePlatform = undefined;
	return state.services?.dispose() ?? Promise.resolve();
}

/**
 * Start a query and wait for it on a cache miss. Rejects if that request
 * fails. Stale cached data resolves immediately and revalidates in the
 * browser. The handle is marked `ensured`, so `useQuery` returns its data
 * directly.
 */
export async function ensure<TFactory extends QueryFactory>(
	cache: QueryCache,
	factory: TFactory,
	...args: LoadArgs<TFactory>
): Promise<EnsuredQueryHandle<TFactory>> {
	const entry = build(cache, factory, args[0]);
	unwrap(await load(entry, args[1]?.pages));
	return { ...handleOf<TFactory>(entry), ensured: true };
}

/** Like `ensure`, but resolves to the data. */
export async function fetch<TFactory extends QueryFactory>(
	cache: QueryCache,
	factory: TFactory,
	...args: LoadArgs<TFactory>
): Promise<DataOf<TFactory>> {
	const entry = build(cache, factory, args[0]);
	// SAFETY: as in `typed`.
	return unsafeCast<DataOf<TFactory>>(
		unwrap(await load(entry, args[1]?.pages)),
	);
}

/**
 * Cached data for a factory call, or `undefined` if there is none. Data can
 * itself be `undefined`; `Query.getUnsafe(getQuery(...)).hasData` tells
 * them apart.
 */
export function getData<TFactory extends QueryFactory>(
	cache: QueryCache,
	factory: TFactory,
	...args: InputArgs<TFactory>
): DataOf<TFactory> | undefined {
	const entry = find(cache, factory, args[0]);
	return entry?.state.hasData ? dataOf<TFactory>(entry) : undefined;
}

/**
 * The cache entry for a factory call, created if missing. Doesn't fetch.
 * For bindings; apps use the verbs.
 */
export function getQuery<TFactory extends QueryFactory>(
	cache: QueryCache,
	factory: TFactory,
	...args: InputArgs<TFactory>
): Query.Of<TFactory> {
	return typed<TFactory>(build(cache, factory, args[0]));
}

/**
 * Mark queries stale and refetch the ones being read. Resolves once those
 * refetches settle, so an action stays pending until fresh data is on
 * screen.
 */
export async function invalidate<TFactory extends QueryFactory>(
	cache: QueryCache,
	...target: Target<TFactory>
): Promise<void> {
	await Promise.all(match(cache, target).map(Entry.invalidate));
}

/**
 * How many entries have a request in flight: all of them, or those
 * matching `filter`. For global loading indicators.
 */
export function isFetching(cache: QueryCache, filter?: Filter): number {
	const entries = filter ? match(cache, [filter]) : all(cache);
	return entries.filter((query) => Entry.entryOf(query).state.isFetching)
		.length;
}

/**
 * Refetch read, stale queries on window focus and reconnect until the
 * returned function is called. Mounts share one platform subscription.
 * Does nothing on the server.
 */
export function mount(cache: QueryCache): () => void {
	const state = implOf(cache);
	if (state.isServer || state.closed) {
		return () => {};
	}
	state.mounts += 1;
	if (state.mounts === 1) {
		state.unsubscribePlatform = state.platform.subscribeUnsafe((event) => {
			for (const entry of state.entries.values()) {
				if (Entry.isObserved(entry)) {
					Entry.onPlatformEvent(entry, event);
				}
			}
		});
	}
	let mounted = true;
	return () => {
		if (!mounted) {
			return;
		}
		mounted = false;
		state.mounts -= 1;
		if (state.mounts === 0) {
			state.unsubscribePlatform?.();
			state.unsubscribePlatform = undefined;
		}
	};
}

/**
 * Start a query without waiting and return its handle. Fresh data is
 * reused; stale data refetches in the background (in the browser only, see
 * {@link Config.isServer}). Errors surface where the data is read, never
 * here.
 */
export function prefetch<TFactory extends QueryFactory>(
	cache: QueryCache,
	factory: TFactory,
	...args: InputArgs<TFactory>
): QueryHandle<TFactory> {
	const entry = build(cache, factory, args[0]);
	startPrefetch(entry);
	return handleOf<TFactory>(entry);
}

/**
 * Remove queries from the cache and abort their requests. Readers keep the
 * removed entry until they render again.
 */
export function remove<TFactory extends QueryFactory>(
	cache: QueryCache,
	...target: Target<TFactory>
): void {
	for (const entry of match(cache, target)) {
		Entry.remove(entry);
	}
}

/**
 * Drop queries' data and errors, as if they were never fetched. Read ones
 * suspend and refetch; resolves once those refetches settle.
 */
export async function reset<TFactory extends QueryFactory>(
	cache: QueryCache,
	...target: Target<TFactory>
): Promise<void> {
	await Promise.all(match(cache, target).map(Entry.reset));
}

/** Write data for a factory call. Readers re-render without suspending. */
export function setData<TFactory extends QueryFactory>(
	cache: QueryCache,
	factory: TFactory,
	input: InputOf<TFactory>,
	updater: Updater<DataOf<TFactory>>,
): void {
	const entry = build(cache, factory, input);
	const next = isUpdateFunction(updater)
		? updater(entry.state.hasData ? dataOf<TFactory>(entry) : undefined)
		: updater;
	Entry.setData(entry, next);
}

/** Listen to cache events synchronously, as they happen. */
export function subscribe(
	cache: QueryCache,
	listener: (event: Event) => void,
): () => void {
	const listeners = implOf(cache).listeners;
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Snapshot the cache for transfer to another cache (server → browser). */
export function dehydrate(
	cache: QueryCache,
	options: DehydrateOptions = {},
): DehydratedState {
	return dehydrateEntries(implOf(cache).entries.values(), options);
}

/**
 * Snapshot the cache, then stream entries as they start or settle, each
 * entry once. Entries that change in the same tick share a batch, which is
 * sent a microtask later. `close()` sends what changed before, then ends
 * `updates`; {@link hydrate} each batch on the receiving end.
 */
export function dehydrateStream(
	cache: QueryCache,
	options: DehydrateOptions = {},
): DehydratedStream {
	const entries = implOf(cache).entries;
	return streamEntries(
		() => entries.values(),
		(listener) => subscribe(cache, listener),
		options,
	);
}

/**
 * Write dehydrated entries. Existing entries only take newer data; pending
 * entries resume the sender's request.
 */
export function hydrate(
	cache: QueryCache,
	state: DehydratedState,
	options: HydrateOptions = {},
): void {
	hydrateEntries((key) => entryFor(cache, key), state, options);
}
