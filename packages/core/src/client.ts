import { Effect, Predicate, Queue, Stream } from "effect";

import { unsafeCast } from "./cast.ts";
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
import {
	type Query,
	QueryEntry,
	type QueryHost,
	type QueryState,
} from "./query.ts";

export interface QueryClientConfig {
	/** Defaults for every query; a factory's own options win. */
	readonly defaults?: QueryBehavior;
	/**
	 * Whether this client runs on the server. Detected from `window`. Server
	 * clients don't retry, never garbage-collect, and skip stale timers.
	 */
	readonly isServer?: boolean;
	/** Called with every failed request, including failed prefetches. */
	onError?(error: unknown, query: Query): void;
}

/** Emitted by {@link QueryClient.subscribe} for every cache change. */
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

/** A new value, or a function of the current one. `undefined` writes nothing. */
export type Updater<TData> =
	| TData
	| ((previous: TData | undefined) => TData | undefined)
	| undefined;

/** Effect-returning twins of the client's async methods. */
export interface QueryClientEffect {
	ensure<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: LoadArgs<TFactory>
	): Effect.Effect<EnsuredQueryHandle<TFactory>, unknown>;
	fetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: LoadArgs<TFactory>
	): Effect.Effect<DataOf<TFactory>, unknown>;
	invalidate<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<void>;
	invalidate(filter: QueryFilter): Effect.Effect<void>;
	/**
	 * The entry's current state, then every change. Counts as a reader while
	 * the stream runs, so invalidation and focus refetch it.
	 */
	watch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Stream.Stream<QueryState<DataOf<TFactory>>>;
}

/** Cache internals shared with `hydrate` / `dehydrate`; not exported publicly. */
export interface CacheAccess {
	all(): ReadonlyArray<QueryEntry>;
	entryFor(key: QueryKey): QueryEntry;
}

const caches = new WeakMap<QueryClient, CacheAccess>();

export function cacheOf(client: QueryClient): CacheAccess {
	const cache = caches.get(client);
	if (!cache) {
		throw new Error("Not a QueryClient");
	}
	return cache;
}

const noop = () => {};
const identity = <T>(value: T) => value;

function isUpdateFunction<TData>(
	updater: Updater<TData>,
): updater is (previous: TData | undefined) => TData | undefined {
	return Predicate.isFunction(updater);
}

function typed<TFactory extends QueryFactory>(
	entry: QueryEntry,
): Query<DataOf<TFactory>, TFactory> {
	// SAFETY: an entry's hash comes from its factory's `queryKey`, and only
	// that factory's `queryFn` (or data written through the same factory)
	// fills it, so its data has the factory's data type.
	return unsafeCast<Query<DataOf<TFactory>, TFactory>>(entry);
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

function ensuredHandleOf<TFactory extends QueryFactory>(
	entry: QueryEntry,
): EnsuredQueryHandle<TFactory> {
	return { ...handleOf<TFactory>(entry), ensured: true };
}

/**
 * The query cache. Create one per request on the server and one per browser
 * tab.
 */
export class QueryClient {
	/** Effect-returning versions of `ensure`, `fetch`, `invalidate`, plus `watch`. */
	readonly effect: QueryClientEffect;
	readonly isServer: boolean;
	#cache = new Map<string, QueryEntry>();
	#host: QueryHost;
	#listeners = new Set<(event: CacheEvent) => void>();
	#mounts = 0;
	#unmountWindow = noop;

	constructor(config: QueryClientConfig = {}) {
		this.isServer = config.isServer ?? !("window" in globalThis);
		const emit = (event: CacheEvent) => {
			for (const listener of this.#listeners) {
				listener(event);
			}
		};
		this.#host = {
			changed: (query) => emit({ query, type: "updated" }),
			defaults: config.defaults ?? {},
			isServer: this.isServer,
			observersChanged: (query) => emit({ query, type: "observers" }),
			remove: (query) => {
				if (this.#cache.get(query.hash) === query) {
					this.#cache.delete(query.hash);
					query.destroy();
					emit({ query, type: "removed" });
				}
			},
			reportError: (error, query) => {
				config.onError?.(error, query);
				emit({ error, query, type: "failed" });
			},
		};
		caches.set(this, {
			all: () => [...this.#cache.values()],
			entryFor: (key) => this.#entryFor(key, hashKey(key)),
		});
		this.effect = this.#effectApi();
	}

	/**
	 * The cache entry for a factory call, created if missing. Doesn't fetch.
	 * For bindings; apps use the verbs.
	 */
	getQuery<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Query<DataOf<TFactory>, TFactory> {
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
	): QueryHandle<TFactory> {
		const entry = this.#build(factory, args[0]);
		const state = entry.getState();
		if (!state.isFetching && (!state.hasData || entry.isStaleNow())) {
			entry.fetch().catch(noop);
		}
		return handleOf<TFactory>(entry);
	}

	/**
	 * Start a query and wait for it on a cache miss. Rejects if that request
	 * fails. Stale cached data resolves immediately and revalidates. The
	 * handle is marked `ensured`, so `useQuery` returns its data directly.
	 */
	async ensure<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: LoadArgs<TFactory>
	): Promise<EnsuredQueryHandle<TFactory>> {
		const entry = this.#build(factory, args[0]);
		await this.#load(entry, args[1]?.pages);
		return ensuredHandleOf<TFactory>(entry);
	}

	/** Like `ensure`, but resolves to the data. */
	async fetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: LoadArgs<TFactory>
	): Promise<DataOf<TFactory>> {
		const entry = this.#build(factory, args[0]);
		await this.#load(entry, args[1]?.pages);
		const data = typed<TFactory>(entry).getState().data;
		if (data === undefined) {
			throw new Error(`Query ${entry.hash} has no data`);
		}
		return data;
	}

	/**
	 * Mark queries stale and refetch the ones being read. Resolves once those
	 * refetches settle, so an action stays pending until fresh data is on
	 * screen.
	 */
	invalidate<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Promise<void>;
	invalidate(filter: QueryFilter): Promise<void>;
	async invalidate(
		target: QueryFactory | QueryFilter,
		input?: unknown,
	): Promise<void> {
		await Promise.all(
			this.#match(target, input).map((entry) => entry.invalidate()),
		);
	}

	/**
	 * Drop queries' data and errors, as if they were never fetched. Read ones
	 * suspend and refetch; resolves once those refetches settle.
	 */
	reset<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Promise<void>;
	reset(filter: QueryFilter): Promise<void>;
	async reset(
		target: QueryFactory | QueryFilter,
		input?: unknown,
	): Promise<void> {
		await Promise.all(this.#match(target, input).map((entry) => entry.reset()));
	}

	/**
	 * Remove queries from the cache and abort their requests. Readers keep the
	 * removed entry until they render again.
	 */
	remove<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): void;
	remove(filter: QueryFilter): void;
	remove(target: QueryFactory | QueryFilter, input?: unknown) {
		for (const entry of this.#match(target, input)) {
			this.#host.remove(entry);
		}
	}

	/**
	 * Write data for a factory call. Readers re-render without suspending.
	 * `undefined` (or an updater returning it) leaves the cache untouched.
	 */
	setData<TFactory extends QueryFactory>(
		factory: TFactory,
		input: InputOf<TFactory>,
		updater: Updater<DataOf<TFactory>>,
	): void {
		const options = optionsFor(factory, input);
		const hash = hashKey(options.queryKey);
		const existing = this.#cache.get(hash);
		const next = isUpdateFunction(updater)
			? updater(
					existing ? typed<TFactory>(existing).getState().data : undefined,
				)
			: updater;
		if (next === undefined) {
			return;
		}
		const entry = this.#entryFor(options.queryKey, hash);
		entry.setOptions(options, input);
		entry.setData(next);
	}

	/** Cached data for a factory call, or `undefined`. */
	getData<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): DataOf<TFactory> | undefined {
		const options = optionsFor(factory, args[0]);
		const entry = this.#cache.get(hashKey(options.queryKey));
		return entry ? typed<TFactory>(entry).getState().data : undefined;
	}

	/** Every entry, for devtools and integrations. */
	getAll(): ReadonlyArray<Query> {
		return [...this.#cache.values()];
	}

	/** Listen to entries being added, updated, and removed. */
	subscribe(listener: (event: CacheEvent) => void): () => void {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	/** Drop every entry and abort in-flight requests. */
	clear() {
		const entries = [...this.#cache.values()];
		this.#cache.clear();
		for (const entry of entries) {
			entry.destroy();
			for (const listener of this.#listeners) {
				listener({ query: entry, type: "removed" });
			}
		}
	}

	/**
	 * Start refetching read, stale queries on window focus and reconnect.
	 * Returns the matching unmount. Providers call this; mounts are counted.
	 */
	mount(): () => void {
		this.#mounts++;
		if (this.#mounts === 1 && !this.isServer) {
			this.#unmountWindow = this.#listenToWindow();
		}
		let mounted = true;
		return () => {
			if (!mounted) {
				return;
			}
			mounted = false;
			this.#mounts--;
			if (this.#mounts === 0) {
				this.#unmountWindow();
				this.#unmountWindow = noop;
			}
		};
	}

	#entryFor(key: QueryKey, hash: string) {
		const existing = this.#cache.get(hash);
		if (existing) {
			return existing;
		}
		const entry = new QueryEntry(this.#host, key, hash);
		this.#cache.set(hash, entry);
		for (const listener of this.#listeners) {
			listener({ query: entry, type: "added" });
		}
		return entry;
	}

	#build(factory: QueryFactory, input: unknown) {
		const options = optionsFor(factory, input);
		const entry = this.#entryFor(options.queryKey, hashKey(options.queryKey));
		entry.setOptions(options, input);
		return entry;
	}

	#load(entry: QueryEntry, pages: number | undefined): Promise<unknown> {
		const state = entry.getState();
		if (!state.hasData) {
			return entry.fetch({ pages });
		}
		if (!state.isFetching && entry.isStaleNow()) {
			entry.fetch().catch(noop);
		}
		return Promise.resolve(state.data);
	}

	#match(target: QueryFactory | QueryFilter, input: unknown) {
		if (Predicate.isFunction(target)) {
			const entry = this.#cache.get(
				hashKey(optionsFor(target, input).queryKey),
			);
			return entry ? [entry] : [];
		}
		const hash = hashKey(target.queryKey);
		return [...this.#cache.values()].filter((entry) =>
			target.exact
				? entry.hash === hash
				: matchesKey(entry.key, target.queryKey),
		);
	}

	#listenToWindow() {
		const each = (event: "focus" | "reconnect") => {
			for (const entry of this.#cache.values()) {
				if (entry.isObserved) {
					entry.onWindowEvent(event);
				}
			}
		};
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				each("focus");
			}
		};
		const onOnline = () => each("reconnect");
		window.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("online", onOnline);
		return () => {
			window.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("online", onOnline);
		};
	}

	#effectApi(): QueryClientEffect {
		const invalidate = (target: QueryFactory | QueryFilter, input?: unknown) =>
			Effect.promise(() =>
				Promise.all(
					this.#match(target, input).map((entry) => entry.invalidate()),
				),
			).pipe(Effect.asVoid);
		return {
			ensure: (factory, ...args) =>
				Effect.tryPromise({
					catch: identity,
					try: () => this.ensure(factory, ...args),
				}),
			fetch: (factory, ...args) =>
				Effect.tryPromise({
					catch: identity,
					try: () => this.fetch(factory, ...args),
				}),
			invalidate,
			watch: (factory, ...args) =>
				Stream.callback((queue) => {
					const query = this.getQuery(factory, ...args);
					return Effect.acquireRelease(
						Effect.sync(() => {
							Queue.offerUnsafe(queue, query.getState());
							return query.subscribe(() =>
								Queue.offerUnsafe(queue, query.getState()),
							);
						}),
						(unsubscribe) => Effect.sync(unsubscribe),
					);
				}),
		};
	}
}
