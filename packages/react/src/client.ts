import {
	type DataOf,
	type DehydratedState,
	type DehydrateOptions,
	type EnsuredQueryHandle,
	type HydrateOptions,
	type InputArgs,
	type InputOf,
	Query,
	QueryCache,
	type QueryFactory,
	type QueryHandle,
} from "@raf-query/core";
import { Effect, Exit, Option, Scope } from "effect";

export interface QueryClientConfig extends QueryCache.Config {
	/** Called with every failed request, including failed prefetches. */
	onError?(error: unknown, query: Query.Query): void;
}

/**
 * The query cache, with Promise methods. Create one per request on the
 * server and one per browser tab. `effect` is the same cache's Effect API.
 */
export class QueryClient {
	/** The Effect-native cache behind this client. */
	readonly effect: QueryCache.QueryCache;
	readonly isServer: boolean;
	/** Owns the cache's fibers and mounts; lives as long as the client. */
	readonly #scope = Scope.makeUnsafe();

	constructor(config: QueryClientConfig = {}) {
		this.effect = Effect.runSync(
			QueryCache.make(config).pipe(Scope.provide(this.#scope)),
		);
		this.isServer = this.effect.isServer;
		const onError = config.onError;
		if (onError) {
			this.effect.subscribeUnsafe((event) => {
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
	getQuery<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Query.Of<TFactory> {
		return this.effect.getQueryUnsafe(factory, ...args);
	}

	/**
	 * Start a query without waiting and return its handle. Fresh data is
	 * reused; stale data refetches in the background (in the browser only).
	 * Errors surface where the data is read, never here.
	 */
	prefetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): QueryHandle<TFactory> {
		return Effect.runSync(this.effect.prefetch(factory, ...args));
	}

	/**
	 * Start a query and wait for it on a cache miss. Rejects if that request
	 * fails. Stale cached data resolves immediately and revalidates in the
	 * browser. The handle is marked `ensured`, so `useQuery` returns its data
	 * directly.
	 */
	ensure<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: QueryCache.LoadArgs<TFactory>
	): Promise<EnsuredQueryHandle<TFactory>> {
		return Effect.runPromise(this.effect.ensure(factory, ...args));
	}

	/** Like `ensure`, but resolves to the data. */
	fetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: QueryCache.LoadArgs<TFactory>
	): Promise<DataOf<TFactory>> {
		return Effect.runPromise(this.effect.fetch(factory, ...args));
	}

	/**
	 * Mark queries stale and refetch the ones being read. Resolves once those
	 * refetches settle, so an action stays pending until fresh data is on
	 * screen. Takes a factory and its input, or a {@link QueryFilter}.
	 */
	invalidate<TFactory extends QueryFactory>(
		...target: QueryCache.Target<TFactory>
	): Promise<void> {
		return Effect.runPromise(this.effect.invalidate(...target));
	}

	/**
	 * Drop queries' data and errors, as if they were never fetched. Read ones
	 * suspend and refetch; resolves once those refetches settle.
	 */
	reset<TFactory extends QueryFactory>(
		...target: QueryCache.Target<TFactory>
	): Promise<void> {
		return Effect.runPromise(this.effect.reset(...target));
	}

	/**
	 * Remove queries from the cache and abort their requests. Readers keep the
	 * removed entry until they render again.
	 */
	remove<TFactory extends QueryFactory>(
		...target: QueryCache.Target<TFactory>
	): void {
		Effect.runSync(this.effect.remove(...target));
	}

	/** Write data for a factory call. Readers re-render without suspending. */
	setData<TFactory extends QueryFactory>(
		factory: TFactory,
		input: InputOf<TFactory>,
		updater: QueryCache.Updater<DataOf<TFactory>>,
	): void {
		Effect.runSync(this.effect.setData(factory, input, updater));
	}

	/**
	 * Cached data for a factory call, or `undefined` if there is none. Data can
	 * itself be `undefined`; `Query.getUnsafe(getQuery(...)).hasData` tells
	 * them apart.
	 */
	getData<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): DataOf<TFactory> | undefined {
		return Option.getOrUndefined(
			Effect.runSync(this.effect.getData(factory, ...args)),
		);
	}

	/** Every entry, for devtools and integrations. */
	getAll(): ReadonlyArray<Query.Query> {
		return Effect.runSync(this.effect.all);
	}

	/** Listen to entries being added, updated, and removed. */
	subscribe(listener: (event: QueryCache.Event) => void): () => void {
		return this.effect.subscribeUnsafe(listener);
	}

	/** Drop every entry and abort in-flight requests. */
	clear(): void {
		Effect.runSync(this.effect.clear);
	}

	/**
	 * Start refetching read, stale queries on window focus and reconnect.
	 * Returns the matching unmount. Providers call this; mounts are counted.
	 */
	mount(): () => void {
		const scope = Scope.forkUnsafe(this.#scope);
		Effect.runSync(this.effect.mount.pipe(Scope.provide(scope)));
		return () => {
			Effect.runSync(Scope.close(scope, Exit.void));
		};
	}
}

/** Snapshot the cache for transfer to another client (server → browser). */
export function dehydrate(
	client: QueryClient,
	options?: DehydrateOptions,
): DehydratedState {
	return Effect.runSync(client.effect.dehydrate(options));
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
	Effect.runSync(client.effect.hydrate(state, options));
}
