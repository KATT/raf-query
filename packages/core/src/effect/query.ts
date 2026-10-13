/**
 * `Query` from `@raf-query/core`, with its requests as Effects. Get one from
 * `QueryCache.getQuery(factory, input)`.
 */
import { type Context, Effect, type Stream } from "effect";
import { dual } from "effect/Function";

import * as internal from "../entry.ts";
import type { QueryFactory, ServicesOf } from "../options.ts";
import * as Core from "../query.ts";
import { listen } from "./listen.ts";
import {
	awaitOutcome,
	type CancelledError,
	provideCaller,
} from "./services.ts";

export { CancelledError } from "./services.ts";
export {
	type FetchRequest,
	getUnsafe,
	hasNextPageUnsafe,
	hasPreviousPageUnsafe,
	isQuery,
	isStaleUnsafe,
	metaUnsafe,
	observerCountUnsafe,
	type Of,
	type Query,
	readUnsafe,
	type State,
	type SubscribeOptions,
	subscribeUnsafe,
	TypeId,
} from "../query.ts";

type Query<TData, TFactory extends QueryFactory, TError> = Core.Query<
	TData,
	TFactory,
	TError
>;

/**
 * Start a request, or join the one in flight. Fails with the request's
 * error, or a {@link CancelledError} if the entry leaves the cache first.
 * The entry's requests run with this fiber's services from now on, as after
 * a `QueryCache` verb.
 */
export const fetch: {
	(
		request?: Core.FetchRequest,
	): <TData, TFactory extends QueryFactory, TError>(
		self: Query<TData, TFactory, TError>,
	) => Effect.Effect<TData, TError | CancelledError, ServicesOf<TFactory>>;
	<TData, TFactory extends QueryFactory, TError>(
		self: Query<TData, TFactory, TError>,
		request?: Core.FetchRequest,
	): Effect.Effect<TData, TError | CancelledError, ServicesOf<TFactory>>;
} = dual(
	(args) => Core.isQuery(args[0]),
	<TData, TFactory extends QueryFactory, TError>(
		self: Query<TData, TFactory, TError>,
		request?: Core.FetchRequest,
	) =>
		Effect.contextWith((caller: Context.Context<never>) => {
			const entry = internal.entryOf(self);
			provideCaller(entry, caller);
			return awaitOutcome<TData, TError>(() => internal.fetch(entry, request));
		}),
);

/** Refetch now; succeeds when the request settles, whatever its outcome. */
export function refetch<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Effect.Effect<void> {
	return Effect.promise(() => Core.refetch(self));
}

/** Load the page after the last one; succeeds once it settles. */
export function fetchNextPage<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Effect.Effect<void> {
	return Effect.promise(() => Core.fetchNextPage(self));
}

/** Load the page before the first one; succeeds once it settles. */
export function fetchPreviousPage<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Effect.Effect<void> {
	return Effect.promise(() => Core.fetchPreviousPage(self));
}

/** Mark stale, and refetch if read; succeeds once that refetch settles. */
export function invalidate<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Effect.Effect<void> {
	return Effect.promise(() => Core.invalidate(self));
}

/**
 * Drop data and errors, back to the state of a new entry. Readers suspend
 * and refetch; succeeds when that refetch settles.
 */
export function reset<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Effect.Effect<void> {
	return Effect.promise(() => Core.reset(self));
}

/** The entry's current state. */
export function get<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Effect.Effect<Core.State<TData>> {
	return Effect.sync(() => Core.getUnsafe(self));
}

/**
 * The entry's current state, then every change. Counts as a reader while
 * the stream runs, so invalidation and focus refetch it.
 */
export function changes<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Stream.Stream<Core.State<TData>> {
	return listen((push) => {
		push(Core.getUnsafe(self));
		return Core.subscribeUnsafe(self, () => push(Core.getUnsafe(self)));
	});
}
