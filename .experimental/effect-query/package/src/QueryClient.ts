/**
 * The app's runtime: its services (an RPC client, say) and a
 * {@link QueryCache.QueryCache}, in one `ManagedRuntime`. The root boundary
 * mounts it; loaders and event handlers run Effects on it directly.
 */
import {
	type Context,
	type Effect,
	type Exit,
	Layer,
	ManagedRuntime,
	Predicate,
} from "effect";

import * as QueryCache from "./QueryCache.ts";

export const TypeId = "~@raf-query/experimental-effect-query/QueryClient";

export type TypeId = typeof TypeId;

export interface QueryClient<in R, out ER = never> {
	readonly runtime: ManagedRuntime.ManagedRuntime<
		R | QueryCache.QueryCache,
		ER
	>;
	readonly [TypeId]: TypeId;
}

export type Any = QueryClient<never, unknown>;

export type Services<C> = C extends QueryClient<infer R, infer _ER> ? R : never;

export const isQueryClient = (u: unknown): u is Any =>
	Predicate.hasProperty(u, TypeId);

/** A client whose queries and Effects get `layer`'s services. */
export const make = <R, ER>(
	layer: Layer.Layer<R, ER>,
	config?: QueryCache.Config,
): QueryClient<R, ER> => ({
	runtime: ManagedRuntime.make(Layer.merge(QueryCache.layer(config), layer)),
	[TypeId]: TypeId,
});

/** Runs an Effect with the client's services, such as a loader's `QueryCache.prefetch`. */
export const runPromise = <A, E, R, ER>(
	client: QueryClient<R, ER>,
	effect: Effect.Effect<A, E, R | QueryCache.QueryCache>,
): Promise<A> => client.runtime.runPromise(effect);

/** Starts an Effect with the client's services without waiting, such as a prefetch on hover. */
export const runFork = <A, E, R, ER>(
	client: QueryClient<R, ER>,
	effect: Effect.Effect<A, E, R | QueryCache.QueryCache>,
): void => {
	client.runtime.runFork(effect);
};

export const dispose = (client: Any): Promise<void> => client.runtime.dispose();

const contexts = new WeakMap<
	Any,
	Promise<Exit.Exit<Context.Context<never>, unknown>>
>();

/**
 * The client's services once its layer is built, the same promise every call,
 * for React's `use()`. A layer that fails settles with the failure's `Exit`.
 */
export const contextExitUnsafe = <R, ER>(
	client: QueryClient<R, ER>,
): Promise<Exit.Exit<Context.Context<R | QueryCache.QueryCache>, ER>> => {
	let promise = contexts.get(client);
	if (promise === undefined) {
		promise = client.runtime.runPromiseExit(client.runtime.contextEffect);
		contexts.set(client, promise);
	}
	// SAFETY: the promise was made from this client's runtime, so its context and error are the client's.
	return promise as Promise<
		Exit.Exit<Context.Context<R | QueryCache.QueryCache>, ER>
	>;
};
