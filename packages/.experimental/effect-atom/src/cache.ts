import { hashKey, type QueryBehavior } from "@raf-query/core";
import { Context, Effect, Layer, Option, Predicate } from "effect";
import { type AsyncResult, type Atom, AtomRegistry } from "effect/reactivity";

import { unsafeCast } from "./cast.ts";
import * as Entry from "./entry.ts";
import {
	type DehydratedQuery,
	type DehydratedState,
	type DehydrateOptions,
	deserialize,
	dehydrateUnsafe,
	type HydrateOptions,
	hydrateUnsafe,
	newer,
} from "./hydration.ts";
import type {
	DataOf,
	EnsuredQueryHandle,
	ErrorOf,
	InputArgs,
	InputOf,
	LoadArgs,
	QueryFactory,
	QueryHandle,
	ServicesOf,
} from "./options.ts";

export const TypeId = "~@raf-query/experimental-effect-atom/QueryCache";
export type TypeId = typeof TypeId;

export interface Config {
	/** Behavior for queries that don't set their own. */
	readonly defaults?: QueryBehavior;
	/**
	 * Server caches don't retry, keep entries until the registry is
	 * disposed, refetch only missing data, and skip focus and reconnect
	 * refetches. Default: `true` when there is no `window`.
	 */
	readonly isServer?: boolean;
}

/** `setData`'s value: the new data, or a function of the cached data. */
export type Updater<TData> = TData | ((previous: TData | undefined) => TData);

/** A query's atom: its `AsyncResult`, refetched on focus and reconnect while read and stale. */
export type QueryAtom<TFactory extends QueryFactory> = Atom.Atom<
	AsyncResult.AsyncResult<DataOf<TFactory>, ErrorOf<TFactory>>
>;

/**
 * The query cache, as atoms in an `AtomRegistry`. The verbs that can start
 * a request need the services of the factory's `queryFn`; the request runs
 * with them, over the services the cache was built with.
 */
export interface QueryCache {
	/**
	 * The query's atom, to read with `registry.get`,
	 * `AtomRegistry.getResult` or from other atoms. Reading it starts the
	 * request if the registry doesn't hold the query yet, with the cache's
	 * services.
	 */
	atom<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): QueryAtom<TFactory>;
	/**
	 * Start a query and wait for it on a cache miss. Fails if that request
	 * fails. Stale cached data succeeds right away and revalidates in the
	 * browser. The handle is marked `ensured`.
	 */
	/** Snapshot the cache for transfer to another cache (server → browser). */
	dehydrate(options?: DehydrateOptions): Effect.Effect<DehydratedState>;
	ensure<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: LoadArgs<TFactory>
	): Effect.Effect<
		EnsuredQueryHandle<TFactory>,
		ErrorOf<TFactory>,
		ServicesOf<TFactory>
	>;
	/** Like `ensure`, but succeeds with the data. */
	fetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: LoadArgs<TFactory>
	): Effect.Effect<DataOf<TFactory>, ErrorOf<TFactory>, ServicesOf<TFactory>>;
	/**
	 * Load the page after a paged query's last one, once the request in
	 * flight settles. Never fails; the error is the query's state.
	 */
	fetchNextPage<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<void, never, ServicesOf<TFactory>>;
	/** Like `fetchNextPage`, at the start of the list. */
	fetchPreviousPage<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<void, never, ServicesOf<TFactory>>;
	/** Cached data, without fetching. */
	getData<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<Option.Option<DataOf<TFactory>>>;
	/** The entry for a factory call, created if missing. Doesn't fetch. For bindings. */
	getQueryUnsafe<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Entry.Entry;
	/**
	 * Write dehydrated queries. Existing entries only take newer data;
	 * pending queries resume the sender's request. Queries no factory has
	 * asked for yet wait until one does, taking newer data in the meantime.
	 */
	hydrate(
		state: DehydratedState,
		options?: HydrateOptions,
	): Effect.Effect<void>;
	/**
	 * Refetch a query if something reads it, and wait for that; otherwise
	 * mark it stale for the next `prefetch` / `ensure`.
	 */
	invalidate<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<void, never, ServicesOf<TFactory>>;
	readonly isServer: boolean;
	/**
	 * Start a query without waiting and return its handle. Fresh data is
	 * reused; stale data refetches in the background (in the browser only).
	 * Errors surface where the data is read, never here.
	 */
	prefetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<QueryHandle<TFactory>, never, ServicesOf<TFactory>>;
	readonly registry: AtomRegistry.AtomRegistry;
	/** Write data. Readers re-render with it without suspending. */
	setData<TFactory extends QueryFactory>(
		factory: TFactory,
		input: InputOf<TFactory>,
		updater: Updater<DataOf<TFactory>>,
	): Effect.Effect<void>;
	readonly [TypeId]: TypeId;
}

export const QueryCache = Context.Service<QueryCache>(TypeId);

export function isQueryCache(value: unknown): value is QueryCache {
	return Predicate.hasProperty(value, TypeId);
}

function optionsFor(factory: QueryFactory, input: unknown) {
	// SAFETY: every caller passes the factory's own input (typed through
	// `InputArgs<TFactory>`); `QueryFactory` erases it to `never` only so that
	// any one-argument factory is assignable.
	// oxlint-disable-next-line typescript/consistent-type-assertions
	const call = factory as (input: unknown) => Entry.EntryOptions;
	return call(input);
}

function noop() {}

function isUpdateFunction<TData>(
	updater: Updater<TData>,
): updater is (previous: TData | undefined) => TData {
	return Predicate.isFunction(updater);
}

function handleOf<TFactory extends QueryFactory>(
	entry: Entry.Entry,
	input: unknown,
): QueryHandle<TFactory> {
	// SAFETY: `input` is what the caller passed for this factory, which
	// `InputArgs<TFactory>` type-checked.
	return unsafeCast<QueryHandle<TFactory>>({
		input,
		key: entry.options.queryKey,
	});
}

/**
 * A query cache in the current `AtomRegistry`, whose requests can read the
 * services of the scope it's built in. Closing the scope detaches it from
 * the registry.
 */
export const make = Effect.fnUntraced(function* (config: Config = {}) {
	const registry = yield* AtomRegistry.AtomRegistry;
	const services = yield* Effect.context<never>();
	const store: Entry.Store = {
		defaults: config.defaults ?? {},
		isServer: config.isServer ?? !("window" in globalThis),
		registry,
		services,
	};
	const entries = new Map<string, Entry.Entry>();
	/** Hydrated queries without an entry yet, like `AtomRegistry`'s preloaded serializable values. */
	const preloaded = new Map<string, DehydratedQuery>();

	const previous = registry.onNodeRemoved;
	registry.onNodeRemoved = (node) => {
		previous?.(node);
		const label = node.atom.label?.[0];
		if (label !== undefined && entries.get(label)?.data === node.atom) {
			entries.delete(label);
		}
	};
	yield* Effect.addFinalizer(() =>
		Effect.sync(() => {
			registry.onNodeRemoved = previous;
		}),
	);

	function entryFor(factory: QueryFactory, input: unknown): Entry.Entry {
		const options = optionsFor(factory, input);
		const hash = hashKey(options.queryKey);
		let entry = entries.get(hash);
		if (entry) {
			entry.options = options;
		} else {
			entry = Entry.make(store, hash, options);
			entries.set(hash, entry);
			const seed = preloaded.get(hash);
			if (seed) {
				preloaded.delete(hash);
				hydrateUnsafe(entry, seed);
			}
		}
		return entry;
	}

	/** Keep a hydrated query until its entry exists; a pending one settles into data. */
	function preload(hash: string, query: DehydratedQuery) {
		const current = preloaded.get(hash);
		const kept = current ? newer(current, query) : query;
		preloaded.set(hash, kept);
		if (kept !== query || query.promise === undefined) {
			return;
		}
		query.promise.then((data) => {
			if (preloaded.get(hash) === query) {
				preloaded.set(hash, { data, key: query.key, updatedAt: Date.now() });
			}
		}, noop);
	}

	function hydrateQuery(query: DehydratedQuery) {
		const hash = hashKey(query.key);
		const entry = entries.get(hash);
		if (entry) {
			hydrateUnsafe(entry, query);
		} else {
			preload(hash, query);
		}
	}

	/** The entry, with its requests reading the calling fiber's services too. */
	function entryWith(
		factory: QueryFactory,
		input: unknown,
	): Effect.Effect<Entry.Entry> {
		return Effect.contextWith((caller: Context.Context<never>) => {
			const entry = entryFor(factory, input);
			entry.services = Context.merge(services, caller);
			return Effect.succeed(entry);
		});
	}

	function getDataUnsafe(factory: QueryFactory, input: unknown) {
		const hash = hashKey(optionsFor(factory, input).queryKey);
		const entry =
			entries.get(hash) ??
			(preloaded.has(hash) ? entryFor(factory, input) : undefined);
		return entry ? Entry.getDataUnsafe(entry) : Option.none();
	}

	const cache: QueryCache = {
		atom: (factory, ...args) =>
			// SAFETY: the entry under this factory's key holds this factory's
			// data and fails with its `queryFn`'s errors.
			unsafeCast(entryFor(factory, args[0]).read),
		dehydrate: (options = {}) =>
			Effect.sync(() => {
				const queries: Array<DehydratedQuery> = [];
				for (const entry of entries.values()) {
					const query = dehydrateUnsafe(entry, options);
					if (query) {
						queries.push(query);
					}
				}
				return { queries: [...queries, ...preloaded.values()] };
			}),
		ensure: (factory, ...args) =>
			entryWith(factory, args[0]).pipe(
				Effect.flatMap((entry) =>
					Entry.load(entry, { pages: args[1]?.pages }).pipe(
						Effect.as({
							...handleOf<typeof factory>(entry, args[0]),
							ensured: true as const,
						}),
					),
				),
				// SAFETY: the request fails with the factory's `queryFn` errors.
				(effect) => unsafeCast(effect),
			),
		fetch: (factory, ...args) =>
			// SAFETY: the entry under this factory's key holds this factory's
			// data and fails with its `queryFn`'s errors.
			unsafeCast(
				entryWith(factory, args[0]).pipe(
					Effect.flatMap((entry) =>
						Entry.load(entry, { pages: args[1]?.pages }),
					),
				),
			),
		fetchNextPage: (factory, ...args) =>
			entryWith(factory, args[0]).pipe(
				Effect.flatMap((entry) => Entry.fetchPage(entry, "forward")),
			),
		fetchPreviousPage: (factory, ...args) =>
			entryWith(factory, args[0]).pipe(
				Effect.flatMap((entry) => Entry.fetchPage(entry, "backward")),
			),
		getData: (factory, ...args) =>
			// SAFETY: the entry under this factory's key holds this factory's data.
			Effect.sync(() => unsafeCast(getDataUnsafe(factory, args[0]))),
		getQueryUnsafe: (factory, ...args) => entryFor(factory, args[0]),
		hydrate: (state, options = {}) =>
			Effect.sync(() => {
				for (const query of state.queries) {
					hydrateQuery(deserialize(query, options));
				}
			}),
		invalidate: (factory, ...args) =>
			entryWith(factory, args[0]).pipe(Effect.flatMap(Entry.invalidate)),
		isServer: store.isServer,
		prefetch: (factory, ...args) =>
			entryWith(factory, args[0]).pipe(
				Effect.map((entry) => {
					Entry.startUnsafe(entry);
					return handleOf<typeof factory>(entry, args[0]);
				}),
			),
		registry,
		setData: (factory, input, updater) =>
			Effect.sync(() => {
				const entry = entryFor(factory, input);
				Entry.setDataUnsafe(
					entry,
					isUpdateFunction(updater)
						? updater(
								// SAFETY: the entry under this factory's key holds its data.
								unsafeCast(Option.getOrUndefined(Entry.getDataUnsafe(entry))),
							)
						: updater,
				);
			}),
		[TypeId]: TypeId,
	};
	return cache;
});

/**
 * The cache as a layer over the `AtomRegistry`. Build it on top of the
 * services your queries need:
 *
 * ```ts
 * QueryCache.layer().pipe(
 *   Layer.provideMerge(Layer.merge(AtomRegistry.layer, IssueApi.layer)),
 * );
 * ```
 */
export const layer = (
	config?: Config,
): Layer.Layer<QueryCache, never, AtomRegistry.AtomRegistry> =>
	Layer.effect(QueryCache, make(config));
