/**
 * The query cache, as an Effect service. `make` builds one in the current
 * scope, on Effect's `Clock` (so `TestClock` drives its timers) and the
 * current {@link Platform}; closing the scope cancels every request and
 * timer it started. Everything that waits, or changes the cache, is an
 * Effect; `getQueryUnsafe`, `isFetchingUnsafe` and `subscribeUnsafe` are for
 * renders and external stores. `fromCache` views an existing cache (a
 * `QueryClient`'s `cache`) the same way.
 *
 * Requests run with the services the cache was built with, under those of
 * the latest verb that called for the entry. So the verbs that can start a
 * request (`ensure`, `fetch`, `prefetch`, `getQuery`, `watch`) require the
 * factory's {@link ServicesOf}; requests a render, a refetch or `invalidate`
 * starts reuse the entry's last services.
 */
import {
	Clock,
	Context,
	Effect,
	Layer,
	Option,
	Predicate,
	Scope,
	Stream,
} from "effect";

import * as Core from "../cache.ts";
import { unsafeCast } from "../cast.ts";
import * as Entry from "../entry.ts";
import type {
	DehydratedState,
	DehydrateOptions,
	HydrateOptions,
} from "../hydration.ts";
import type {
	DataOf,
	EnsuredQueryHandle,
	ErrorOf,
	InputArgs,
	InputOf,
	QueryFactory,
	QueryHandle,
	ServicesOf,
} from "../options.ts";
import type * as Query from "../query.ts";
import { listen } from "./listen.ts";
import { Platform } from "./platform.ts";
import {
	awaitOutcome,
	type CancelledError,
	fromContext,
	provideCaller,
} from "./services.ts";

export type { Event, Filter, LoadArgs, Target, Updater } from "../cache.ts";

export const TypeId = "~@raf-query/core/effect/QueryCache";

export type TypeId = typeof TypeId;

/** `QueryCache.make`'s options; the clock, platform and services come from the fiber. */
export type Config = Pick<Core.Config, "defaults" | "isServer">;

/** The cache now, then entries as they start or settle. */
export interface DehydratedStream {
	/** The entries to send first. */
	readonly initial: DehydratedState;
	/**
	 * Later entries, in batches. Ends once the scope `dehydrateStream` ran in
	 * closes, after a last batch of what changed before. One consumer only.
	 */
	readonly updates: Stream.Stream<DehydratedState>;
}

export interface QueryCache {
	/** Every entry. */
	readonly all: Effect.Effect<ReadonlyArray<Query.Query>>;
	/** The Promise cache this service runs on. */
	readonly cache: Core.QueryCache;
	/** Drop every entry and cancel their requests. */
	readonly clear: Effect.Effect<void>;
	/**
	 * Start a query and wait for it on a cache miss. Fails if that request
	 * fails. Stale cached data succeeds immediately and revalidates in the
	 * browser. The handle is marked `ensured`, so `useQuery` returns its data
	 * directly.
	 */
	ensure<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: Core.LoadArgs<TFactory>
	): Effect.Effect<
		EnsuredQueryHandle<TFactory>,
		ErrorOf<TFactory> | CancelledError,
		ServicesOf<TFactory>
	>;
	/** Like `ensure`, but succeeds with the data. */
	fetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: Core.LoadArgs<TFactory>
	): Effect.Effect<
		DataOf<TFactory>,
		ErrorOf<TFactory> | CancelledError,
		ServicesOf<TFactory>
	>;
	/**
	 * Cached data for a factory call. `Some(undefined)` when the data itself
	 * is `undefined`.
	 */
	getData<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<Option.Option<DataOf<TFactory>>>;
	/**
	 * The cache entry for a factory call, created if missing. Doesn't fetch,
	 * but its requests run with this fiber's services from now on. For
	 * bindings; apps use the verbs.
	 */
	getQuery<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<Query.Of<TFactory>, never, ServicesOf<TFactory>>;
	/**
	 * `getQuery`, synchronously, for renders. Leaves the entry's services as
	 * they are: the cache's, or the latest verb caller's.
	 */
	getQueryUnsafe<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Query.Of<TFactory>;
	/**
	 * Mark queries stale and refetch the ones being read. Succeeds once those
	 * refetches settle, so an action stays pending until fresh data is on
	 * screen.
	 */
	invalidate<TFactory extends QueryFactory>(
		...target: Core.Target<TFactory>
	): Effect.Effect<void>;
	/**
	 * How many entries have a request in flight: all of them, or those
	 * matching `filter`. For global loading indicators.
	 */
	isFetching(filter?: Core.Filter): Effect.Effect<number>;
	/** `isFetching`, synchronously, for renders. */
	isFetchingUnsafe(filter?: Core.Filter): number;
	readonly isServer: boolean;
	/**
	 * Refetch read, stale queries on window focus and reconnect while the
	 * scope is open. Mounts share one platform subscription. Does nothing on
	 * the server.
	 */
	readonly mount: Effect.Effect<void, never, Scope.Scope>;
	/**
	 * Start a query without waiting and return its handle. Fresh data is
	 * reused; stale data refetches in the background (in the browser only).
	 * Errors surface where the data is read, never here.
	 */
	prefetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<QueryHandle<TFactory>, never, ServicesOf<TFactory>>;
	/**
	 * Remove queries from the cache and cancel their requests. Readers keep
	 * the removed entry until they render again.
	 */
	remove<TFactory extends QueryFactory>(
		...target: Core.Target<TFactory>
	): Effect.Effect<void>;
	/**
	 * Drop queries' data and errors, as if they were never fetched. Read ones
	 * suspend and refetch; succeeds once those refetches settle.
	 */
	reset<TFactory extends QueryFactory>(
		...target: Core.Target<TFactory>
	): Effect.Effect<void>;
	/** Write data for a factory call. Readers re-render without suspending. */
	setData<TFactory extends QueryFactory>(
		factory: TFactory,
		input: InputOf<TFactory>,
		updater: Core.Updater<DataOf<TFactory>>,
	): Effect.Effect<void>;
	/** Listen to cache events synchronously, as they happen. */
	subscribeUnsafe(listener: (event: Core.Event) => void): () => void;
	readonly [TypeId]: TypeId;
}

export const QueryCache = /*#__PURE__*/ Context.Service<QueryCache>(TypeId);

export function isQueryCache(value: unknown): value is QueryCache {
	return Predicate.hasProperty(value, TypeId);
}

/** The entry for a verb: its requests get the caller's services. */
function buildFor(
	cache: Core.QueryCache,
	factory: QueryFactory,
	input: unknown,
): Effect.Effect<Entry.Entry> {
	return Effect.contextWith((caller: Context.Context<never>) => {
		const entry = Core.build(cache, factory, input);
		provideCaller(entry, caller);
		return Effect.succeed(entry);
	});
}

function typed<TFactory extends QueryFactory>(
	entry: Entry.Entry,
): Query.Of<TFactory> {
	// SAFETY: an entry's hash comes from its factory's `queryKey`, so its data
	// and errors have the factory's types.
	return unsafeCast<Query.Of<TFactory>>(entry);
}

function handleOf<TFactory extends QueryFactory>(
	entry: Entry.Entry,
): QueryHandle<TFactory> {
	// SAFETY: `entry.handle.input` is the input of the latest call through
	// this factory, which `InputArgs<TFactory>` type-checked.
	return unsafeCast<QueryHandle<TFactory>>(entry.handle);
}

function load<TFactory extends QueryFactory>(
	entry: Entry.Entry,
	pages: number | undefined,
) {
	return awaitOutcome<DataOf<TFactory>, ErrorOf<TFactory>>(() =>
		Core.load(entry, pages),
	);
}

/**
 * The service view of an existing cache. A cache without `services` gets
 * empty ones, so its Effect `queryFn`s run with what verb callers provide.
 */
export function fromCache(cache: Core.QueryCache): QueryCache {
	Core.stateOf(cache).services ??= fromContext(Context.empty());
	const isFetchingUnsafe = (filter?: Core.Filter) =>
		Core.isFetching(cache, filter);
	return {
		all: Effect.sync(() => Core.all(cache)),
		cache,
		clear: Effect.sync(() => Core.clear(cache)),
		ensure: (factory, ...args) =>
			Effect.flatMap(buildFor(cache, factory, args[0]), (entry) =>
				load<typeof factory>(entry, args[1]?.pages).pipe(
					Effect.as({ ...handleOf<typeof factory>(entry), ensured: true }),
				),
			),
		fetch: (factory, ...args) =>
			Effect.flatMap(buildFor(cache, factory, args[0]), (entry) =>
				load<typeof factory>(entry, args[1]?.pages),
			),
		getData: (factory, ...args) =>
			Effect.sync(() => {
				const entry = Core.find(cache, factory, args[0]);
				// SAFETY: as in `typed`; `hasData` says `data` is set.
				return entry?.state.hasData
					? Option.some(unsafeCast<DataOf<typeof factory>>(entry.state.data))
					: Option.none();
			}),
		getQuery: (factory, ...args) =>
			Effect.map(buildFor(cache, factory, args[0]), typed<typeof factory>),
		getQueryUnsafe: (factory, ...args) =>
			Core.getQuery(cache, factory, ...args),
		invalidate: (...target) =>
			Effect.promise(() => Core.invalidate(cache, ...target)),
		isFetching: (filter) => Effect.sync(() => isFetchingUnsafe(filter)),
		isFetchingUnsafe,
		isServer: cache.isServer,
		mount: cache.isServer
			? Effect.void
			: Effect.asVoid(
					Effect.acquireRelease(
						Effect.sync(() => Core.mount(cache)),
						(unmount) => Effect.sync(unmount),
					),
				),
		prefetch: (factory, ...args) =>
			Effect.map(buildFor(cache, factory, args[0]), (entry) => {
				Core.startPrefetch(entry);
				return handleOf<typeof factory>(entry);
			}),
		remove: (...target) => Effect.sync(() => Core.remove(cache, ...target)),
		reset: (...target) => Effect.promise(() => Core.reset(cache, ...target)),
		setData: (factory, input, updater) =>
			Effect.sync(() => Core.setData(cache, factory, input, updater)),
		subscribeUnsafe: (listener) => Core.subscribe(cache, listener),
		[TypeId]: TypeId,
	};
}

/** Build a cache in the current scope, with the current `Clock` and {@link Platform}. */
export const make: (
	config?: Config,
) => Effect.Effect<QueryCache, never, Scope.Scope> =
	/*#__PURE__*/ Effect.fnUntraced(function* (config: Config = {}) {
		const platform = yield* Platform;
		const clock = yield* Clock.Clock;
		const context = Context.omit(Scope.Scope)(yield* Effect.context<never>());
		const runFork = Effect.runForkWith(context);
		const cache = Core.make({
			clock: {
				now: () => clock.currentTimeMillisUnsafe(),
				schedule: (callback, ms) => {
					const fiber = runFork(
						Effect.andThen(Effect.sleep(ms), Effect.sync(callback)),
					);
					return () => fiber.interruptUnsafe();
				},
			},
			defaults: config.defaults,
			isServer: config.isServer ?? platform.isServer,
			platform,
			services: fromContext(context),
		});
		yield* Effect.addFinalizer(() => Effect.promise(() => Core.dispose(cache)));
		return fromCache(cache);
	});

/** A layer that provides a {@link QueryCache} for the layer's lifetime. */
export const layer = (config?: Config): Layer.Layer<QueryCache> =>
	Layer.effect(QueryCache, make(config));

/** Cache events from the moment the stream starts. */
export function events(cache: QueryCache): Stream.Stream<Core.Event> {
	return listen(cache.subscribeUnsafe);
}

/** A factory call's `Query.changes`. */
export function watch<TFactory extends QueryFactory>(
	cache: QueryCache,
	factory: TFactory,
	...args: InputArgs<TFactory>
): Stream.Stream<Query.State<DataOf<TFactory>>, never, ServicesOf<TFactory>> {
	return Stream.unwrap(
		Effect.map(buildFor(cache.cache, factory, args[0]), (entry) =>
			listen<Query.State<DataOf<TFactory>>>((push) => {
				// SAFETY: as in `typed`, for every state.
				const state = () =>
					unsafeCast<Query.State<DataOf<TFactory>>>(entry.state);
				push(state());
				return Entry.subscribeUnsafe(entry, () => push(state()));
			}),
		),
	);
}

/** Snapshot the cache for transfer to another cache (server → browser). */
export function dehydrate(
	cache: QueryCache,
	options?: DehydrateOptions,
): Effect.Effect<DehydratedState> {
	return Effect.sync(() => Core.dehydrate(cache.cache, options));
}

/**
 * Snapshot the cache, then stream entries as they start or settle, each
 * entry once. Entries that change in the same tick share a batch, which is
 * sent a microtask later. `updates` ends when the scope closes, after
 * sending what changed before; {@link hydrateStream} is the receiving end.
 */
export function dehydrateStream(
	cache: QueryCache,
	options?: DehydrateOptions,
): Effect.Effect<DehydratedStream, never, Scope.Scope> {
	return Effect.map(
		Effect.acquireRelease(
			Effect.sync(() => Core.dehydrateStream(cache.cache, options)),
			(stream) => Effect.sync(() => stream.close()),
		),
		(stream) => ({
			initial: stream.initial,
			updates: Stream.orDie(
				Stream.fromReadableStream({
					evaluate: () => stream.updates,
					onError: (error) => error,
				}),
			),
		}),
	);
}

/**
 * Write dehydrated entries. Existing entries only take newer data; pending
 * entries resume the sender's request.
 */
export function hydrate(
	cache: QueryCache,
	state: DehydratedState,
	options?: HydrateOptions,
): Effect.Effect<void> {
	return Effect.sync(() => Core.hydrate(cache.cache, state, options));
}

/** {@link hydrate} every state of a stream as it arrives ({@link dehydrateStream}'s `updates`). */
export function hydrateStream<E, R>(
	cache: QueryCache,
	states: Stream.Stream<DehydratedState, E, R>,
	options?: HydrateOptions,
): Effect.Effect<void, E, R> {
	return Stream.runForEach(states, (state) => hydrate(cache, state, options));
}
