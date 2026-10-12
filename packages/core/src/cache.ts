/**
 * The query cache, as an Effect service. `make` builds one in the current
 * scope; closing the scope interrupts every request and timer it started.
 * Everything that waits, or changes the cache, is an Effect; `getQueryUnsafe`
 * and `subscribeUnsafe` are for renders and external stores.
 */
import {
	Clock,
	Context,
	Effect,
	Layer,
	Option,
	Predicate,
	RcRef,
	type Scope,
	Stream,
} from "effect";

import { unsafeCast } from "./cast.ts";
import * as Entry from "./entry.ts";
import {
	canDehydrate,
	type DehydratedState,
	type DehydrateOptions,
	dehydrateUnsafe,
	hydrateEntries,
	type HydrateOptions,
} from "./hydration.ts";
import { hashKey, matchesKey, type QueryKey } from "./key.ts";
import { listen } from "./listen.ts";
import {
	type DataOf,
	type EnsuredQueryHandle,
	type ErrorOf,
	type InputArgs,
	type InputOf,
	type LoadOptions,
	optionsFor,
	type QueryBehavior,
	type QueryFactory,
	type QueryHandle,
} from "./options.ts";
import { Platform } from "./platform.ts";
import type * as Query from "./query.ts";

export const TypeId = "~@raf-query/core/QueryCache";

export type TypeId = typeof TypeId;

export interface Config {
	/** Defaults for every query; a factory's own options win. */
	readonly defaults?: QueryBehavior;
	/**
	 * Whether this cache runs on the server. Default: the {@link Platform}'s.
	 * Server caches don't retry, never garbage-collect, skip stale timers, and
	 * reuse cached data in `prefetch` / `ensure` / `fetch` instead of
	 * revalidating it, unless `invalidate` marked it.
	 */
	readonly isServer?: boolean;
}

/** Emitted on {@link QueryCache.events} for every cache change. */
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

/** Matches cache entries by key prefix, or by exact key with `exact`. */
export interface Filter {
	readonly exact?: boolean;
	readonly queryKey: QueryKey;
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

export interface QueryCache {
	/** Every entry. */
	readonly all: Effect.Effect<ReadonlyArray<Query.Query>>;
	/** Drop every entry and interrupt their requests. */
	readonly clear: Effect.Effect<void>;
	/** Snapshot the cache for transfer to another cache (server → browser). */
	dehydrate(options?: DehydrateOptions): Effect.Effect<DehydratedState>;
	/**
	 * Start a query and wait for it on a cache miss. Fails if that request
	 * fails. Stale cached data succeeds immediately and revalidates in the
	 * browser. The handle is marked `ensured`, so `useQuery` returns its data
	 * directly.
	 */
	ensure<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: LoadArgs<TFactory>
	): Effect.Effect<
		EnsuredQueryHandle<TFactory>,
		ErrorOf<TFactory> | Query.CancelledError
	>;
	/** Cache events from the moment the stream starts. */
	readonly events: Stream.Stream<Event>;
	/** Like `ensure`, but succeeds with the data. */
	fetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: LoadArgs<TFactory>
	): Effect.Effect<DataOf<TFactory>, ErrorOf<TFactory> | Query.CancelledError>;
	/**
	 * Cached data for a factory call. `Some(undefined)` when the data itself
	 * is `undefined`.
	 */
	getData<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<Option.Option<DataOf<TFactory>>>;
	/**
	 * The cache entry for a factory call, created if missing. Doesn't fetch.
	 * For bindings; apps use the verbs.
	 */
	getQuery<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<Query.Of<TFactory>>;
	/** `getQuery`, synchronously, for renders. */
	getQueryUnsafe<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Query.Of<TFactory>;
	/**
	 * Write dehydrated entries. Existing entries only take newer data; pending
	 * entries resume the sender's request.
	 */
	hydrate(
		state: DehydratedState,
		options?: HydrateOptions,
	): Effect.Effect<void>;
	/**
	 * Mark queries stale and refetch the ones being read. Succeeds once those
	 * refetches settle, so an action stays pending until fresh data is on
	 * screen.
	 */
	invalidate<TFactory extends QueryFactory>(
		...target: Target<TFactory>
	): Effect.Effect<void>;
	readonly isServer: boolean;
	/**
	 * Refetch read, stale queries on window focus and reconnect while the
	 * scope is open. Mounts share one platform subscription. Does nothing on
	 * the server.
	 */
	readonly mount: Effect.Effect<void, never, Scope.Scope>;
	/**
	 * Start a query without waiting and return its handle. Fresh data is
	 * reused; stale data refetches in the background (in the browser only, see
	 * {@link Config.isServer}). Errors surface where the data is read, never
	 * here.
	 */
	prefetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<QueryHandle<TFactory>>;
	/**
	 * Remove queries from the cache and interrupt their requests. Readers keep
	 * the removed entry until they render again.
	 */
	remove<TFactory extends QueryFactory>(
		...target: Target<TFactory>
	): Effect.Effect<void>;
	/**
	 * Drop queries' data and errors, as if they were never fetched. Read ones
	 * suspend and refetch; succeeds once those refetches settle.
	 */
	reset<TFactory extends QueryFactory>(
		...target: Target<TFactory>
	): Effect.Effect<void>;
	/** Write data for a factory call. Readers re-render without suspending. */
	setData<TFactory extends QueryFactory>(
		factory: TFactory,
		input: InputOf<TFactory>,
		updater: Updater<DataOf<TFactory>>,
	): Effect.Effect<void>;
	/** Listen to cache events synchronously, as they happen. */
	subscribeUnsafe(listener: (event: Event) => void): () => void;
	readonly [TypeId]: TypeId;
	/** A factory call's `Query.changes`. */
	watch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Stream.Stream<Query.State<DataOf<TFactory>>>;
}

export const QueryCache = Context.Service<QueryCache>(TypeId);

export function isQueryCache(value: unknown): value is QueryCache {
	return Predicate.hasProperty(value, TypeId);
}

function isUpdateFunction<TData>(
	updater: Updater<TData>,
): updater is (previous: TData | undefined) => TData {
	return Predicate.isFunction(updater);
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
function load<TFactory extends QueryFactory>(
	entry: Entry.Entry,
	pages: number | undefined,
): Effect.Effect<DataOf<TFactory>, ErrorOf<TFactory> | Query.CancelledError> {
	if (!entry.state.hasData) {
		// SAFETY: as in `typed`.
		return unsafeCast<
			Effect.Effect<DataOf<TFactory>, ErrorOf<TFactory> | Query.CancelledError>
		>(Entry.fetch(entry, { pages }));
	}
	revalidate(entry);
	return Effect.succeed(dataOf<TFactory>(entry));
}

/** Settles every effect, started together. */
function settleAll(effects: ReadonlyArray<Effect.Effect<void>>) {
	return Effect.all(effects, { concurrency: "unbounded", discard: true });
}

/** Build a cache in the current scope, with the current `Clock` and {@link Platform}. */
export const make: (
	config?: Config,
) => Effect.Effect<QueryCache, never, Scope.Scope> = Effect.fnUntraced(
	function* (config: Config = {}) {
		const platform = yield* Platform;
		const state: Entry.CacheState = {
			clock: yield* Clock.Clock,
			defaults: config.defaults ?? {},
			entries: new Map(),
			isServer: config.isServer ?? platform.isServer,
			listeners: new Set(),
			platform,
			scope: yield* Effect.scope,
			services: yield* Effect.context<never>(),
		};

		const entryFor = (key: QueryKey) => {
			const hash = hashKey(key);
			const existing = state.entries.get(hash);
			if (existing) {
				return existing;
			}
			const entry = Entry.make(state, key, hash);
			state.entries.set(hash, entry);
			Entry.emit(state, { query: entry, type: "added" });
			return entry;
		};

		const build = (factory: QueryFactory, input: unknown) => {
			const options = optionsFor(factory, input);
			const entry = entryFor(options.queryKey);
			Entry.setOptions(entry, options, input);
			return entry;
		};

		const match = <TFactory extends QueryFactory>(target: Target<TFactory>) => {
			// SAFETY: a target is a factory and its input, or a lone filter;
			// `InputArgs` only narrows the input's type.
			const [first, input] =
				unsafeCast<readonly [QueryFactory | Filter, unknown?]>(target);
			if (Predicate.isFunction(first)) {
				const entry = state.entries.get(
					hashKey(optionsFor(first, input).queryKey),
				);
				return entry ? [entry] : [];
			}
			const hash = hashKey(first.queryKey);
			return [...state.entries.values()].filter((entry) =>
				first.exact
					? entry.hash === hash
					: matchesKey(entry.key, first.queryKey),
			);
		};

		const subscription = yield* RcRef.make({
			acquire: Effect.acquireRelease(
				Effect.sync(() =>
					platform.subscribeUnsafe((event) => {
						for (const entry of state.entries.values()) {
							if (Entry.isObserved(entry)) {
								Entry.onPlatformEvent(entry, event);
							}
						}
					}),
				),
				(unsubscribe) => Effect.sync(unsubscribe),
			),
		});

		const subscribeUnsafe = (listener: (event: Event) => void) => {
			state.listeners.add(listener);
			return () => {
				state.listeners.delete(listener);
			};
		};

		const getQueryUnsafe = <TFactory extends QueryFactory>(
			factory: TFactory,
			...args: InputArgs<TFactory>
		) => typed<TFactory>(build(factory, args[0]));

		const cache: QueryCache = {
			all: Effect.sync(() => [...state.entries.values()]),
			clear: Effect.sync(() => {
				for (const entry of state.entries.values()) {
					Entry.remove(entry);
				}
			}),
			dehydrate: (options = {}) =>
				Effect.sync(() => {
					const filter = options.filter ?? canDehydrate;
					return {
						queries: [...state.entries.values()]
							.filter(filter)
							.map((entry) => dehydrateUnsafe(entry, options)),
					};
				}),
			ensure: (factory, ...args) =>
				Effect.suspend(() => {
					const entry = build(factory, args[0]);
					return load<typeof factory>(entry, args[1]?.pages).pipe(
						Effect.as({ ...handleOf<typeof factory>(entry), ensured: true }),
					);
				}),
			events: listen(subscribeUnsafe),
			fetch: (factory, ...args) =>
				Effect.suspend(() =>
					load<typeof factory>(build(factory, args[0]), args[1]?.pages),
				),
			getData: (factory, ...args) =>
				Effect.sync(() => {
					const options = optionsFor(factory, args[0]);
					const entry = state.entries.get(hashKey(options.queryKey));
					return entry?.state.hasData
						? Option.some(dataOf<typeof factory>(entry))
						: Option.none();
				}),
			getQuery: (factory, ...args) =>
				Effect.sync(() => getQueryUnsafe(factory, ...args)),
			getQueryUnsafe,
			hydrate: (dehydrated, options = {}) =>
				Effect.sync(() => hydrateEntries(entryFor, dehydrated, options)),
			invalidate: (...target) =>
				Effect.suspend(() => settleAll(match(target).map(Entry.invalidate))),
			isServer: state.isServer,
			mount: state.isServer
				? Effect.void
				: Effect.asVoid(RcRef.get(subscription)),
			prefetch: (factory, ...args) =>
				Effect.sync(() => {
					const entry = build(factory, args[0]);
					if (entry.state.hasData) {
						revalidate(entry);
					} else {
						Entry.start(entry);
					}
					return handleOf<typeof factory>(entry);
				}),
			remove: (...target) =>
				Effect.sync(() => {
					for (const entry of match(target)) {
						Entry.remove(entry);
					}
				}),
			reset: (...target) =>
				Effect.suspend(() => settleAll(match(target).map(Entry.reset))),
			setData: (factory, input, updater) =>
				Effect.sync(() => {
					const entry = build(factory, input);
					const next = isUpdateFunction(updater)
						? updater(
								entry.state.hasData ? dataOf<typeof factory>(entry) : undefined,
							)
						: updater;
					Entry.setData(entry, next);
				}),
			subscribeUnsafe,
			[TypeId]: TypeId,
			watch: (factory, ...args) =>
				Stream.suspend(() =>
					// SAFETY: as in `typed`, for every element.
					unsafeCast<Stream.Stream<Query.State<DataOf<typeof factory>>>>(
						Entry.changes(build(factory, args[0])),
					),
				),
		};
		return cache;
	},
);

/** A layer that provides a {@link QueryCache} for the layer's lifetime. */
export const layer = (config?: Config): Layer.Layer<QueryCache> =>
	Layer.effect(QueryCache, make(config));
