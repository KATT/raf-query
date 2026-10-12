/**
 * Effect-returning client verbs (`@raf-query/core/effect`). `queryOptions`
 * itself takes an Effect `queryFn` and a `Schedule` retry.
 */
import { Effect, Queue, Stream } from "effect";

import {
	cacheOf,
	type LoadArgs,
	type QueryClient,
	type QueryFilter,
} from "./client.ts";
import type {
	DataOf,
	EnsuredQueryHandle,
	InputArgs,
	QueryFactory,
} from "./options.ts";
import type { QueryState } from "./query.ts";

const identity = <T>(value: T) => value;

/** `client.ensure` as an Effect. */
export function ensureEffect<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: LoadArgs<TFactory>
): Effect.Effect<EnsuredQueryHandle<TFactory>, unknown> {
	return Effect.tryPromise({
		catch: identity,
		try: () => client.ensure(factory, ...args),
	});
}

/** `client.fetch` as an Effect: fails with the request's error. */
export function fetchEffect<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: LoadArgs<TFactory>
): Effect.Effect<DataOf<TFactory>, unknown> {
	return Effect.tryPromise({
		catch: identity,
		try: () => client.fetch(factory, ...args),
	});
}

/** `client.invalidate` as an Effect. */
export function invalidateEffect<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: InputArgs<TFactory>
): Effect.Effect<void>;
export function invalidateEffect(
	client: QueryClient,
	filter: QueryFilter,
): Effect.Effect<void>;
export function invalidateEffect(
	client: QueryClient,
	target: QueryFactory | QueryFilter,
	input?: unknown,
): Effect.Effect<void> {
	return Effect.promise(() => cacheOf(client).invalidate(target, input));
}

/**
 * The entry's current state, then every change. Counts as a reader while
 * the stream runs, so invalidation and focus refetch it.
 */
export function watch<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: InputArgs<TFactory>
): Stream.Stream<QueryState<DataOf<TFactory>>> {
	return Stream.callback((queue) => {
		const query = client.getQuery(factory, ...args);
		return Effect.acquireRelease(
			Effect.sync(() => {
				Queue.offerUnsafe(queue, query.getState());
				return query.subscribe(() =>
					Queue.offerUnsafe(queue, query.getState()),
				);
			}),
			(unsubscribe) => Effect.sync(unsubscribe),
		);
	});
}
