/**
 * The cache, as an Effect service. `make` builds one in the current scope;
 * closing the scope interrupts every request and timer it started.
 *
 * Each entry keeps the query's last `Exit`, so a failure keeps its whole
 * `Cause`: typed failures stay typed, and defects and interrupts stay
 * distinguishable from them. That is what boundaries route on.
 *
 * Requests run with the services the cache was built with, under those of
 * the latest verb or read that asked for the entry.
 *
 * The verbs are Effects. `readUnsafe`, `subscribeUnsafe` and `retryUnsafe`
 * are for renders and React's event handlers.
 */
import {
	type Cause,
	Clock,
	Context,
	Duration,
	Effect,
	Exit,
	FiberMap,
	Layer,
	Option,
	Predicate,
	type Scope,
} from "effect";

import * as Query from "./Query.ts";

export const TypeId = "~@raf-query/experimental-effect-query/QueryCache";

export type TypeId = typeof TypeId;

export interface Config {
	/** How long an entry nobody reads stays cached. Default: 5 minutes. */
	readonly gcTime?: Duration.Input | undefined;
}

/** What a render reads: a new object on every change, for `useSyncExternalStore`. */
export interface Snapshot<A = unknown, E = unknown> {
	/** The last result, or `undefined` before the first one. */
	readonly exit: Exit.Exit<A, E> | undefined;
	readonly isFetching: boolean;
	/** Settles when the first result arrives. `use()` it while `exit` is `undefined`. */
	readonly promise: Promise<void>;
}

/** Which entries `invalidate` refetches. */
export type Filter = Query.Key | Query.Any;

export interface QueryCache {
	/** `prefetch`, then waits for the result. Fails with the query's error. */
	fetch<A, E, R>(query: Query.Query<A, E, R>): Effect.Effect<A, E, R>;
	/**
	 * Marks matching entries stale. Entries someone reads refetch, keeping their
	 * result on screen until the new one arrives; the rest are dropped. Succeeds
	 * once those refetches settle, whatever their result.
	 */
	invalidate(filter: Filter): Effect.Effect<void>;
	/**
	 * Starts the query's request unless a fresh result is cached or one is in
	 * flight. A failed result refetches from scratch: readers suspend again.
	 */
	prefetch<A, E, R>(query: Query.Query<A, E, R>): Effect.Effect<void, never, R>;
	/** The entry's snapshot, starting its request when there is no entry. For renders. */
	readUnsafe<A, E, R>(
		query: Query.Query<A, E, R>,
		services: Context.Context<R>,
	): Snapshot<A, E>;
	/** Drops failed results whose cause matches, and refetches them. What a boundary's `retry` calls. */
	retryUnsafe(predicate: (cause: Cause.Cause<unknown>) => boolean): void;
	/**
	 * Calls `listener` when the snapshot of the query with this hash changes.
	 * An entry someone listens to is never collected.
	 */
	subscribeUnsafe(hash: string, listener: () => void): () => void;
	readonly [TypeId]: TypeId;
}

export const QueryCache = /*#__PURE__*/ Context.Service<QueryCache>(TypeId);

export const isQueryCache = (u: unknown): u is QueryCache =>
	Predicate.hasProperty(u, TypeId);

interface Entry {
	readonly hash: string;
	invalidated: boolean;
	query: Query.Any;
	/** The request whose result counts; an older one's is ignored. */
	request: object | undefined;
	/** Resolves `snapshot.promise` while there is no result yet. */
	resolve: () => void;
	/** The latest caller's services, which the entry's requests run with. */
	services: Context.Context<never>;
	snapshot: Snapshot;
	updatedAt: number;
	readonly waiters: Set<(exit: Exit.Exit<unknown, unknown>) => void>;
}

const resolved = Promise.resolve();

export const make: (
	config?: Config,
) => Effect.Effect<QueryCache, never, Scope.Scope> =
	/*#__PURE__*/ Effect.fnUntraced(function* (config: Config = {}) {
		const clock = yield* Clock.Clock;
		const services = yield* Effect.context<never>();
		const runFork = Effect.runForkWith(services);
		const gcTime = Duration.fromInputUnsafe(config.gcTime ?? "5 minutes");
		const entries = new Map<string, Entry>();
		// By hash, not on the entry: a reader can subscribe before its entry exists, or after it was dropped.
		const listeners = new Map<string, Set<() => void>>();
		const requests = yield* FiberMap.make<string>();
		const timers = yield* FiberMap.make<string>();

		const isRead = (hash: string) => (listeners.get(hash)?.size ?? 0) > 0;

		const setSnapshot = (entry: Entry, snapshot: Snapshot) => {
			entry.snapshot = snapshot;
			for (const listener of listeners.get(entry.hash) ?? []) {
				listener();
			}
		};

		const pending = (entry: Entry) => {
			const deferred = Promise.withResolvers<void>();
			entry.resolve = deferred.resolve;
			return deferred.promise;
		};

		const settle = (entry: Entry, exit: Exit.Exit<unknown, unknown>) => {
			entry.request = undefined;
			entry.invalidated = false;
			entry.updatedAt = clock.currentTimeMillisUnsafe();
			setSnapshot(entry, {
				exit,
				isFetching: false,
				promise:
					entry.snapshot.exit === undefined ? resolved : entry.snapshot.promise,
			});
			entry.resolve();
			for (const waiter of entry.waiters) {
				waiter(exit);
			}
			entry.waiters.clear();
		};

		const start = (entry: Entry) => {
			const request = {};
			entry.request = request;
			const fiber = Effect.runForkWith(Context.merge(services, entry.services))(
				// SAFETY: `services` came from a verb or read that required the query's `R`.
				entry.query.effect as Effect.Effect<unknown, unknown, never>,
			);
			// Replacing the key interrupts the previous request, whose result `request` now ignores.
			FiberMap.setUnsafe(requests, entry.hash, fiber);
			fiber.addObserver((exit) => {
				if (entry.request === request && entries.get(entry.hash) === entry) {
					settle(entry, exit);
				}
			});
			if (entry.request === request && !entry.snapshot.isFetching) {
				setSnapshot(entry, { ...entry.snapshot, isFetching: true });
			}
		};

		const reset = (entry: Entry) => {
			setSnapshot(entry, {
				exit: undefined,
				isFetching: entry.snapshot.isFetching,
				promise: pending(entry),
			});
			start(entry);
		};

		const remove = (entry: Entry) => {
			entries.delete(entry.hash);
			Option.map(FiberMap.getUnsafe(requests, entry.hash), (fiber) =>
				fiber.interruptUnsafe(),
			);
			// A reader suspended on this entry renders again, and makes a new one.
			entry.resolve();
		};

		const scheduleGc = (entry: Entry) => {
			FiberMap.setUnsafe(
				timers,
				entry.hash,
				runFork(
					Effect.sleep(gcTime).pipe(
						Effect.andThen(
							Effect.sync(() => {
								if (entries.get(entry.hash) === entry && !isRead(entry.hash)) {
									remove(entry);
								}
							}),
						),
					),
				),
			);
		};

		const cancelGc = (hash: string) =>
			Option.map(FiberMap.getUnsafe(timers, hash), (fiber) =>
				fiber.interruptUnsafe(),
			);

		const isFailed = (entry: Entry) =>
			entry.snapshot.exit !== undefined && Exit.isFailure(entry.snapshot.exit);

		const isStale = (entry: Entry) =>
			entry.invalidated ||
			clock.currentTimeMillisUnsafe() - entry.updatedAt >=
				Duration.toMillis(entry.query.staleTime);

		const ensure = (
			query: Query.Any,
			caller: Context.Context<never>,
			refetch: boolean,
		): Entry => {
			const existing = entries.get(query.hash);
			if (existing === undefined) {
				const entry: Entry = {
					hash: query.hash,
					invalidated: false,
					query,
					request: undefined,
					resolve: () => {},
					services: caller,
					snapshot: { exit: undefined, isFetching: false, promise: resolved },
					updatedAt: 0,
					waiters: new Set(),
				};
				entry.snapshot = { ...entry.snapshot, promise: pending(entry) };
				entries.set(query.hash, entry);
				start(entry);
				if (!isRead(entry.hash)) {
					scheduleGc(entry);
				}
				return entry;
			}
			existing.query = query;
			existing.services = caller;
			if (refetch && existing.request === undefined) {
				if (isFailed(existing)) {
					reset(existing);
				} else if (isStale(existing)) {
					start(existing);
				}
			}
			return existing;
		};

		const awaitSettled = (entry: Entry) =>
			Effect.callback<Exit.Exit<unknown, unknown>>((resume) => {
				if (entry.request === undefined && entry.snapshot.exit !== undefined) {
					resume(Effect.succeed(entry.snapshot.exit));
					return;
				}
				const waiter = (settled: Exit.Exit<unknown, unknown>) =>
					resume(Effect.succeed(settled));
				entry.waiters.add(waiter);
				return Effect.sync(() => entry.waiters.delete(waiter));
			});

		const matching = (filter: Filter) => {
			const prefix = Query.isQuery(filter) ? filter.key : filter;
			return [...entries.values()].filter((entry) =>
				Query.matchesKey(prefix, entry.query.key),
			);
		};

		const cache: QueryCache = {
			fetch: <A, E, R>(query: Query.Query<A, E, R>) =>
				Effect.contextWith((caller: Context.Context<R>) => {
					const entry = ensure(query, caller, true);
					return (
						// SAFETY: only `query.effect`, of the same key, fills this entry.
						Effect.flatten(awaitSettled(entry)) as Effect.Effect<A, E>
					);
				}),
			invalidate: (filter) =>
				Effect.suspend(() => {
					const refetching: Array<Entry> = [];
					for (const entry of matching(filter)) {
						if (isRead(entry.hash)) {
							entry.invalidated = true;
							start(entry);
							refetching.push(entry);
						} else {
							remove(entry);
						}
					}
					return Effect.forEach(refetching, awaitSettled, {
						concurrency: "unbounded",
						discard: true,
					});
				}),
			prefetch: <A, E, R>(query: Query.Query<A, E, R>) =>
				Effect.contextWith((caller: Context.Context<R>) => {
					ensure(query, caller, true);
					return Effect.void;
				}),
			readUnsafe: <A, E, R>(
				query: Query.Query<A, E, R>,
				caller: Context.Context<R>,
			) =>
				// SAFETY: only `query.effect`, of the same key, fills this entry.
				ensure(query, caller, false).snapshot as Snapshot<A, E>,
			retryUnsafe: (predicate) => {
				for (const entry of entries.values()) {
					const { exit } = entry.snapshot;
					if (
						exit !== undefined &&
						Exit.isFailure(exit) &&
						predicate(exit.cause)
					) {
						reset(entry);
					}
				}
			},
			subscribeUnsafe: (hash, listener) => {
				let set = listeners.get(hash);
				if (set === undefined) {
					set = new Set();
					listeners.set(hash, set);
				}
				set.add(listener);
				cancelGc(hash);
				return () => {
					set.delete(listener);
					if (set.size > 0) {
						return;
					}
					listeners.delete(hash);
					const entry = entries.get(hash);
					if (entry !== undefined) {
						scheduleGc(entry);
					}
				};
			},
			[TypeId]: TypeId,
		};
		return cache;
	});

export const layer = (config?: Config): Layer.Layer<QueryCache> =>
	Layer.effect(QueryCache, make(config));

/** {@link QueryCache.prefetch}, from the cache in the context. */
export const prefetch = <A, E, R>(
	query: Query.Query<A, E, R>,
): Effect.Effect<void, never, QueryCache | R> =>
	Effect.flatMap(QueryCache, (cache) => cache.prefetch(query));

/** {@link QueryCache.fetch}, from the cache in the context. */
export const fetch = <A, E, R>(
	query: Query.Query<A, E, R>,
): Effect.Effect<A, E, QueryCache | R> =>
	Effect.flatMap(QueryCache, (cache) => cache.fetch(query));

/** {@link QueryCache.invalidate}, from the cache in the context. */
export const invalidate = (
	filter: Filter,
): Effect.Effect<void, never, QueryCache> =>
	Effect.flatMap(QueryCache, (cache) => cache.invalidate(filter));
