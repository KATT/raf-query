import {
	type DataOf,
	type DehydratedState,
	type DehydrateOptions,
	type EffectServices,
	type EnsuredQueryHandle,
	type HydrateOptions,
	type InputArgs,
	type InputOf,
	type Query,
	QueryCache,
	type QueryFactory,
	type QueryHandle,
} from "@raf-query/core";

export interface QueryClientConfig<TServices = never> extends Omit<
	QueryCache.Config,
	"services"
> {
	/** Called with every failed request, including failed prefetches. */
	onError?(error: unknown, query: Query.Query): void;
	/**
	 * Services for queries whose `queryFn` returns an Effect; `dispose()`
	 * releases them. Use `fromLayer(layer)` or `fromContext(context)` from
	 * `@raf-query/react/effect`.
	 */
	readonly services?: EffectServices<TServices>;
}

/**
 * The query cache, with methods. Create one per request on the server and
 * one per browser tab. Its verbs take factories whose `queryFn` needs at
 * most `TServices`, the services of `config.services`.
 */
export class QueryClient<TServices = never> {
	/** The cache behind this client, for `QueryCache` functions and `QueryCache.fromCache` in `/effect`. */
	readonly cache: QueryCache.QueryCache;
	readonly isServer: boolean;

	constructor(config: QueryClientConfig<TServices> = {}) {
		this.cache = QueryCache.make(config);
		this.isServer = this.cache.isServer;
		const onError = config.onError;
		if (onError) {
			QueryCache.subscribe(this.cache, (event) => {
				if (event.type === "failed") {
					onError(event.error, event.query);
				}
			});
		}
	}

	/**
	 * The cache entry for a factory call, created if missing. Doesn't fetch.
	 * For bindings; apps use the verbs.
	 */
	getQuery<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Query.Of<TFactory> {
		return QueryCache.getQuery(this.cache, factory, ...args);
	}

	/**
	 * Start a query without waiting and return its handle. Fresh data is
	 * reused; stale data refetches in the background (in the browser only).
	 * Errors surface where the data is read, never here.
	 */
	prefetch<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): QueryHandle<TFactory> {
		return QueryCache.prefetch(this.cache, factory, ...args);
	}

	/**
	 * Start a query and wait for it on a cache miss. Rejects if that request
	 * fails. Stale cached data resolves immediately and revalidates in the
	 * browser. The handle is marked `ensured`, so `useQuery` returns its data
	 * directly.
	 */
	ensure<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: QueryCache.LoadArgs<TFactory>
	): Promise<EnsuredQueryHandle<TFactory>> {
		return QueryCache.ensure(this.cache, factory, ...args);
	}

	/** Like `ensure`, but resolves to the data. */
	fetch<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: QueryCache.LoadArgs<TFactory>
	): Promise<DataOf<TFactory>> {
		return QueryCache.fetch(this.cache, factory, ...args);
	}

	/**
	 * Mark queries stale and refetch the ones being read. Resolves once those
	 * refetches settle, so an action stays pending until fresh data is on
	 * screen. Takes a factory and its input, or a {@link QueryCache.Filter}.
	 */
	invalidate<TFactory extends QueryFactory<TServices>>(
		...target: QueryCache.Target<TFactory>
	): Promise<void> {
		return QueryCache.invalidate(this.cache, ...target);
	}

	/**
	 * Drop queries' data and errors, as if they were never fetched. Read ones
	 * suspend and refetch; resolves once those refetches settle.
	 */
	reset<TFactory extends QueryFactory<TServices>>(
		...target: QueryCache.Target<TFactory>
	): Promise<void> {
		return QueryCache.reset(this.cache, ...target);
	}

	/**
	 * Remove queries from the cache and abort their requests. Readers keep the
	 * removed entry until they render again.
	 */
	remove<TFactory extends QueryFactory<TServices>>(
		...target: QueryCache.Target<TFactory>
	): void {
		QueryCache.remove(this.cache, ...target);
	}

	/** Write data for a factory call. Readers re-render without suspending. */
	setData<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		input: InputOf<TFactory>,
		updater: QueryCache.Updater<DataOf<TFactory>>,
	): void {
		QueryCache.setData(this.cache, factory, input, updater);
	}

	/**
	 * Cached data for a factory call, or `undefined` if there is none. Data can
	 * itself be `undefined`; `Query.getUnsafe(getQuery(...)).hasData` tells
	 * them apart.
	 */
	getData<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): DataOf<TFactory> | undefined {
		return QueryCache.getData(this.cache, factory, ...args);
	}

	/** Every entry, for devtools and integrations. */
	getAll(): ReadonlyArray<Query.Query> {
		return QueryCache.all(this.cache);
	}

	/**
	 * How many entries have a request in flight: all of them, or those
	 * matching `filter`. For global loading indicators.
	 */
	isFetching(filter?: QueryCache.Filter): number {
		return QueryCache.isFetching(this.cache, filter);
	}

	/** Listen to entries being added, updated, and removed. */
	subscribe(listener: (event: QueryCache.Event) => void): () => void {
		return QueryCache.subscribe(this.cache, listener);
	}

	/** Drop every entry and abort in-flight requests. */
	clear(): void {
		QueryCache.clear(this.cache);
	}

	/**
	 * Start refetching read, stale queries on window focus and reconnect.
	 * Returns the matching unmount. Providers call this; mounts are counted.
	 */
	mount(): () => void {
		return QueryCache.mount(this.cache);
	}

	/**
	 * Close the client: abort every request and timer, and release its
	 * services. Resolves once their finalizers have run.
	 */
	dispose(): Promise<void> {
		return QueryCache.dispose(this.cache);
	}
}

/** Snapshot the cache for transfer to another client (server → browser). */
export function dehydrate(
	client: QueryClient,
	options?: DehydrateOptions,
): DehydratedState {
	return QueryCache.dehydrate(client.cache, options);
}

/**
 * Write dehydrated entries into a client. Existing entries only take newer
 * data; pending entries resume the sender's request.
 */
export function hydrate(
	client: QueryClient,
	state: DehydratedState,
	options?: HydrateOptions,
): void {
	QueryCache.hydrate(client.cache, state, options);
}
