import { Context, Effect, Exit, Layer, Option, Scope } from "effect";
import { AtomRegistry } from "effect/reactivity";

import * as QueryCache from "./cache.ts";
import { unsafeCast } from "./cast.ts";
import type {
	DataOf,
	EnsuredQueryHandle,
	InputArgs,
	InputOf,
	QueryFactory,
	QueryHandle,
} from "./options.ts";

export interface QueryClientConfig<TServices> extends QueryCache.Config {
	/**
	 * Services for queries' Effects. Built when the client is created, so it
	 * must build synchronously; `dispose()` runs its finalizers.
	 */
	readonly layer?: Layer.Layer<TServices>;
	/**
	 * The registry to keep queries in. Pass the app's own to read query atoms
	 * next to its other atoms. Default: a new one, disposed with the client.
	 */
	readonly registry?: AtomRegistry.AtomRegistry;
}

/**
 * The cache with Promise methods, for loaders and components. Create one
 * per request on the server and one per browser tab. `effect` is the same
 * cache's Effect API. Factories may only need the services in `layer`.
 */
export class QueryClient<TServices = never> {
	/** The Effect-native cache behind this client. */
	readonly effect: QueryCache.QueryCache;
	readonly isServer: boolean;
	readonly registry: AtomRegistry.AtomRegistry;
	/** Owns the layer's services and, unless one was passed in, the registry. */
	readonly #scope = Scope.makeUnsafe();
	readonly #services: Context.Context<never>;

	constructor(config: QueryClientConfig<TServices> = {}) {
		const registry = config.registry
			? Layer.succeed(AtomRegistry.AtomRegistry, config.registry)
			: AtomRegistry.layer;
		const built = Effect.runSync(
			Layer.buildWithScope(
				QueryCache.layer(config).pipe(
					Layer.provideMerge(
						config.layer ? Layer.merge(registry, config.layer) : registry,
					),
				),
				this.#scope,
			),
		);
		this.effect = Context.get(built, QueryCache.QueryCache);
		// SAFETY: erased so that a client is assignable across `TServices`;
		// `#provide` is the only reader.
		this.#services = unsafeCast<Context.Context<never>>(built);
		this.isServer = this.effect.isServer;
		this.registry = this.effect.registry;
	}

	/** Run one of the cache's Effects with the client's services. */
	#provide<A, E>(effect: Effect.Effect<A, E, unknown>): Effect.Effect<A, E> {
		// SAFETY: the verbs only take factories whose services are in
		// `TServices` (`QueryFactory<TServices>`), and `#services` holds them.
		return unsafeCast<Effect.Effect<A, E>>(
			Effect.provideContext(effect, this.#services),
		);
	}

	/** See {@link QueryCache.QueryCache.prefetch}. */
	prefetch<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): QueryHandle<TFactory> {
		return Effect.runSync(
			this.#provide(this.effect.prefetch(factory, ...args)),
		);
	}

	/** See {@link QueryCache.QueryCache.ensure}. */
	ensure<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Promise<EnsuredQueryHandle<TFactory>> {
		return Effect.runPromise(
			this.#provide(this.effect.ensure(factory, ...args)),
		);
	}

	/** See {@link QueryCache.QueryCache.fetch}. */
	fetch<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Promise<DataOf<TFactory>> {
		return Effect.runPromise(
			this.#provide(this.effect.fetch(factory, ...args)),
		);
	}

	/** See {@link QueryCache.QueryCache.invalidate}. */
	invalidate<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Promise<void> {
		return Effect.runPromise(
			this.#provide(this.effect.invalidate(factory, ...args)),
		);
	}

	/** See {@link QueryCache.QueryCache.setData}. */
	setData<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		input: InputOf<TFactory>,
		updater: QueryCache.Updater<DataOf<TFactory>>,
	): void {
		Effect.runSync(this.effect.setData(factory, input, updater));
	}

	/** Cached data for a factory call, or `undefined`. Never fetches. */
	getData<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): DataOf<TFactory> | undefined {
		return Option.getOrUndefined(
			Effect.runSync(this.effect.getData(factory, ...args)),
		);
	}

	/** See {@link QueryCache.QueryCache.atom}. */
	atom<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): QueryCache.QueryAtom<TFactory> {
		return this.effect.atom(factory, ...args);
	}

	/**
	 * Release the layer's services and, unless it was passed in, the
	 * registry. Requests in flight are interrupted.
	 */
	dispose(): Promise<void> {
		return Effect.runPromise(Scope.close(this.#scope, Exit.void));
	}
}
