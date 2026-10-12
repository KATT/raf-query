import { Effect, Option, Predicate, RcRef, Scope, Stream } from "effect";

import { unsafeCast } from "./cast.ts";
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
	type ErrorOf,
	type InputArgs,
	type InputOf,
	type LoadOptions,
	optionsFor,
	type QueryBehavior,
	type QueryFactory,
	type QueryHandle,
} from "./options.ts";
import {
	type CancelledError,
	type Query,
	QueryEntry,
	type QueryHost,
	type QueryState,
} from "./query.ts";

export interface QueryCacheConfig {
	/** Defaults for every query; a factory's own options win. */
	readonly defaults?: QueryBehavior;
	/**
	 * Whether this cache runs on the server. Detected from `window`. Server
	 * caches don't retry, never garbage-collect, and skip stale timers.
	 */
	readonly isServer?: boolean;
}

/** Emitted on {@link QueryCache.events} for every cache change. */
export type CacheEvent =
	| {
			readonly query: Query;
			/** `observers`: a reader subscribed or unsubscribed. */
			readonly type: "added" | "observers" | "removed" | "updated";
	  }
	| {
			/** A request failed (after retries), with this error. */
			readonly error: unknown;
			readonly query: Query;
			readonly type: "failed";
	  };

/** Matches cache entries by key prefix, or by exact key with `exact`. */
export interface QueryFilter {
	readonly exact?: boolean;
	readonly queryKey: QueryKey;
}

/** `ensure` / `fetch` arguments: the input, then load options for paged factories. */
export type LoadArgs<TFactory extends QueryFactory> =
	| InputArgs<TFactory>
	| [input: InputOf<TFactory>, options: LoadOptions<TFactory>];

/** The entries `invalidate`, `reset` and `remove` act on: one factory call, or a filter. */
export type QueryTarget<TFactory extends QueryFactory> =
	| [factory: TFactory, ...args: InputArgs<TFactory>]
	| [filter: QueryFilter];

/** A new value, or a function of the current one. */
export type Updater<TData> = TData | ((previous: TData | undefined) => TData);

/** The entry of a factory call, typed by the factory. */
export type QueryOf<TFactory extends QueryFactory> = Query<
	DataOf<TFactory>,
	TFactory,
	ErrorOf<TFactory>
>;

function isUpdateFunction<TData>(
	updater: Updater<TData>,
): updater is (previous: TData | undefined) => TData {
	return Predicate.isFunction(updater);
}

function typed<TFactory extends QueryFactory>(
	entry: QueryEntry,
): QueryOf<TFactory> {
	// SAFETY: an entry's hash comes from its factory's `queryKey`, and only
	// that factory's `queryFn` (or data written through the same factory)
	// fills it, so its data and errors have the factory's types.
	return unsafeCast<QueryOf<TFactory>>(entry);
}

function handleOf<TFactory extends QueryFactory>(
	entry: QueryEntry,
): QueryHandle<TFactory> {
	const handle: { readonly input: unknown; readonly key: QueryKey } =
		entry.handle;
	// SAFETY: `entry.handle.input` is the input of the latest call through
	// this factory, which `InputArgs<TFactory>` type-checked.
	// oxlint-disable-next-line typescript/consistent-type-assertions
	return handle as QueryHandle<TFactory>;
}

/**
 * Waits for an entry's data on a cache miss. Cached data returns at once,
 * and revalidates in the background if stale.
 */
function load<TFactory extends QueryFactory>(
	entry: QueryEntry,
	pages: number | undefined,
): Effect.Effect<DataOf<TFactory>, ErrorOf<TFactory> | CancelledError> {
	const query = typed<TFactory>(entry);
	const state = query.getStateUnsafe();
	if (!state.hasData) {
		return query.fetch({ pages });
	}
	if (!state.isFetching && entry.isStaleUnsafe()) {
		entry.start();
	}
	// SAFETY: `hasData` is set exactly when `data` holds a request's result.
	return Effect.succeed(unsafeCast<DataOf<TFactory>>(state.data));
}

/** Settles every effect, started together. */
function settleAll(effects: ReadonlyArray<Effect.Effect<void>>) {
	return Effect.all(effects, { concurrency: "unbounded", discard: true });
}

/**
 * Calls `onEvent` with `"focus"` when the page becomes visible and with
 * `"reconnect"` when the browser comes back online, until the scope closes.
 */
function onWindowEvents(
	onEvent: (event: "focus" | "reconnect") => void,
): Effect.Effect<void, never, Scope.Scope> {
	const onVisibilityChange = () => {
		if (document.visibilityState === "visible") {
			onEvent("focus");
		}
	};
	const onOnline = () => onEvent("reconnect");
	return Effect.acquireRelease(
		Effect.sync(() => {
			window.addEventListener("visibilitychange", onVisibilityChange);
			window.addEventListener("online", onOnline);
		}),
		() =>
			Effect.sync(() => {
				window.removeEventListener("visibilitychange", onVisibilityChange);
				window.removeEventListener("online", onOnline);
			}),
	);
}

/**
 * The query cache. Create one per request on the server and one per browser
 * tab. Everything that waits, or changes the cache, is an Effect;
 * `getQueryUnsafe` and `subscribeUnsafe` are for renders and external stores.
 */
export class QueryCache {
	/** Every entry. */
	readonly all: Effect.Effect<ReadonlyArray<Query>>;
	/** Drop every entry and interrupt their requests. */
	readonly clear: Effect.Effect<void>;
	/** Cache events from the moment the stream starts. */
	readonly events: Stream.Stream<CacheEvent>;
	readonly isServer: boolean;
	/**
	 * Refetch read, stale queries on window focus and reconnect while the
	 * scope is open. Mounts share one set of window listeners. Does nothing on
	 * the server.
	 */
	readonly mount: Effect.Effect<void, never, Scope.Scope>;
	#entries = new Map<string, QueryEntry>();
	#host: QueryHost;
	#listeners = new Set<(event: CacheEvent) => void>();

	constructor(config: QueryCacheConfig = {}) {
		this.isServer = config.isServer ?? !("window" in globalThis);
		this.#host = {
			changed: (query) => this.#emit({ query, type: "updated" }),
			defaults: config.defaults ?? {},
			isServer: this.isServer,
			observersChanged: (query) => this.#emit({ query, type: "observers" }),
			remove: (query) => this.#remove(query),
			reportError: (error, query) =>
				this.#emit({ error, query, type: "failed" }),
		};
		this.all = Effect.sync(() => [...this.#entries.values()]);
		this.clear = Effect.sync(() => {
			const entries = [...this.#entries.values()];
			this.#entries.clear();
			for (const entry of entries) {
				entry.destroy();
				this.#emit({ query: entry, type: "removed" });
			}
		});
		this.events = listen((emit) => this.subscribeUnsafe(emit));
		this.mount = this.isServer ? Effect.void : this.#windowMount();
	}

	/**
	 * The cache entry for a factory call, created if missing. Doesn't fetch.
	 * For bindings; apps use the verbs.
	 */
	getQuery<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<QueryOf<TFactory>> {
		return Effect.sync(() => this.getQueryUnsafe(factory, ...args));
	}

	/** `getQuery`, synchronously, for renders. */
	getQueryUnsafe<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): QueryOf<TFactory> {
		return typed<TFactory>(this.#build(factory, args[0]));
	}

	/**
	 * Start a query without waiting and return its handle. Fresh data is
	 * reused; stale data refetches in the background. Errors surface where the
	 * data is read, never here.
	 */
	prefetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<QueryHandle<TFactory>> {
		return Effect.sync(() => {
			const entry = this.#build(factory, args[0]);
			const state = entry.getStateUnsafe();
			if (!state.isFetching && (!state.hasData || entry.isStaleUnsafe())) {
				entry.start();
			}
			return handleOf<TFactory>(entry);
		});
	}

	/**
	 * Start a query and wait for it on a cache miss. Fails if that request
	 * fails. Stale cached data succeeds immediately and revalidates.
	 */
	ensure<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: LoadArgs<TFactory>
	): Effect.Effect<QueryHandle<TFactory>, ErrorOf<TFactory> | CancelledError> {
		return Effect.suspend(() => {
			const entry = this.#build(factory, args[0]);
			return load<TFactory>(entry, args[1]?.pages).pipe(
				Effect.as(handleOf<TFactory>(entry)),
			);
		});
	}

	/** Like `ensure`, but succeeds with the data. */
	fetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: LoadArgs<TFactory>
	): Effect.Effect<DataOf<TFactory>, ErrorOf<TFactory> | CancelledError> {
		return Effect.suspend(() =>
			load<TFactory>(this.#build(factory, args[0]), args[1]?.pages),
		);
	}

	/**
	 * Mark queries stale and refetch the ones being read. Succeeds once those
	 * refetches settle, so an action stays pending until fresh data is on
	 * screen.
	 */
	invalidate<TFactory extends QueryFactory>(
		...target: QueryTarget<TFactory>
	): Effect.Effect<void> {
		return Effect.suspend(() =>
			settleAll(this.#match(target).map((entry) => entry.invalidate)),
		);
	}

	/**
	 * Drop queries' data and errors, as if they were never fetched. Read ones
	 * suspend and refetch; succeeds once those refetches settle.
	 */
	reset<TFactory extends QueryFactory>(
		...target: QueryTarget<TFactory>
	): Effect.Effect<void> {
		return Effect.suspend(() =>
			settleAll(this.#match(target).map((entry) => entry.reset)),
		);
	}

	/**
	 * Remove queries from the cache and interrupt their requests. Readers keep
	 * the removed entry until they render again.
	 */
	remove<TFactory extends QueryFactory>(
		...target: QueryTarget<TFactory>
	): Effect.Effect<void> {
		return Effect.sync(() => {
			for (const entry of this.#match(target)) {
				this.#remove(entry);
			}
		});
	}

	/** Write data for a factory call. Readers re-render without suspending. */
	setData<TFactory extends QueryFactory>(
		factory: TFactory,
		input: InputOf<TFactory>,
		updater: Updater<DataOf<TFactory>>,
	): Effect.Effect<void> {
		return Effect.sync(() => {
			const entry = this.#build(factory, input);
			const next = isUpdateFunction(updater)
				? updater(typed<TFactory>(entry).getStateUnsafe().data)
				: updater;
			entry.setData(next);
		});
	}

	/** Cached data for a factory call. */
	getData<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<Option.Option<DataOf<TFactory>>> {
		return Effect.sync(() => {
			const options = optionsFor(factory, args[0]);
			const entry = this.#entries.get(hashKey(options.queryKey));
			const state = entry && typed<TFactory>(entry).getStateUnsafe();
			// SAFETY: `hasData` is set exactly when `data` holds a request's result.
			return state?.hasData
				? Option.some(unsafeCast<DataOf<TFactory>>(state.data))
				: Option.none();
		});
	}

	/** A factory call's {@link Query.changes}. */
	watch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Stream.Stream<QueryState<DataOf<TFactory>>> {
		return Stream.suspend(() => this.getQueryUnsafe(factory, ...args).changes);
	}

	/** Snapshot the cache for transfer to another cache (server → browser). */
	dehydrate(options: DehydrateOptions = {}): Effect.Effect<DehydratedState> {
		return Effect.sync(() => {
			const filter = options.filter ?? canDehydrate;
			return {
				queries: [...this.#entries.values()]
					.filter(filter)
					.map((entry) => dehydrateUnsafe(entry, options)),
			};
		});
	}

	/**
	 * Write dehydrated entries. Existing entries only take newer data; pending
	 * entries resume the sender's request.
	 */
	hydrate(
		state: DehydratedState,
		options: HydrateOptions = {},
	): Effect.Effect<void> {
		return Effect.sync(() =>
			hydrateEntries((key) => this.#entryFor(key), state, options),
		);
	}

	/** Listen to cache events synchronously, as they happen. */
	subscribeUnsafe(listener: (event: CacheEvent) => void): () => void {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	#emit(event: CacheEvent) {
		for (const listener of this.#listeners) {
			listener(event);
		}
	}

	#remove(entry: QueryEntry) {
		if (this.#entries.get(entry.hash) === entry) {
			this.#entries.delete(entry.hash);
			entry.destroy();
			this.#emit({ query: entry, type: "removed" });
		}
	}

	#entryFor(key: QueryKey) {
		const hash = hashKey(key);
		const existing = this.#entries.get(hash);
		if (existing) {
			return existing;
		}
		const entry = new QueryEntry(this.#host, key, hash);
		this.#entries.set(hash, entry);
		this.#emit({ query: entry, type: "added" });
		return entry;
	}

	#build(factory: QueryFactory, input: unknown) {
		const options = optionsFor(factory, input);
		const entry = this.#entryFor(options.queryKey);
		entry.setOptions(options, input);
		return entry;
	}

	#match<TFactory extends QueryFactory>(target: QueryTarget<TFactory>) {
		// SAFETY: a target is a factory and its input, or a lone filter;
		// `InputArgs` only narrows the input's type.
		const [first, input] =
			unsafeCast<readonly [QueryFactory | QueryFilter, unknown?]>(target);
		if (Predicate.isFunction(first)) {
			const entry = this.#entries.get(
				hashKey(optionsFor(first, input).queryKey),
			);
			return entry ? [entry] : [];
		}
		const hash = hashKey(first.queryKey);
		return [...this.#entries.values()].filter((entry) =>
			first.exact ? entry.hash === hash : matchesKey(entry.key, first.queryKey),
		);
	}

	/** One reference-counted set of window listeners, shared by every mount. */
	#windowMount(): Effect.Effect<void, never, Scope.Scope> {
		const listeners = Effect.runSync(
			RcRef.make({
				acquire: onWindowEvents((event) => {
					for (const entry of this.#entries.values()) {
						if (entry.isObserved) {
							entry.onWindowEvent(event);
						}
					}
				}),
			}).pipe(Scope.provide(Scope.makeUnsafe())),
		);
		return RcRef.get(listeners);
	}
}
