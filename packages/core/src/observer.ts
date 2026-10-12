/**
 * One reader's view of one query at a time, as a data type, like TanStack
 * Query's `QueryObserver`: it derives the reader's result from the query's
 * state, keeps a previous query's data for `whilePending: "previous"`, runs
 * `refetchInterval`, and notifies its listeners only when a result property
 * they read changed (see {@link trackResult}). Bindings make one per hook.
 *
 * The `*Unsafe` functions read and update synchronously, for renders and
 * external stores. While it has listeners, the observer holds a `Scope` (a
 * child of its query's) that owns the query subscription and the polling
 * fiber; the last listener leaving, a switch to another query, or the query
 * leaving its cache closes it.
 */
import {
	Effect,
	Exit,
	FiberHandle,
	Pipeable,
	Predicate,
	Scope,
	type Stream,
} from "effect";

import { unsafeCast } from "./cast.ts";
import { entryOf } from "./entry.ts";
import type { QueryKey } from "./key.ts";
import { listen } from "./listen.ts";
import type { QueryFactory } from "./options.ts";
import { Platform } from "./platform.ts";
import * as Query from "./query.ts";
import type { Thenable } from "./thenable.ts";

export const TypeId = "~@raf-query/core/QueryObserver";

export type TypeId = typeof TypeId;

/** How one reader observes its query. */
export interface Options {
	/** Refetch on this interval (ms) while subscribed and the page is visible. */
	readonly refetchInterval?: number;
	/** Refetch on reconnect while stale. Default: the query's option, else `true`. */
	readonly refetchOnReconnect?: boolean;
	/** Refetch on window focus while stale. Default: the query's option, else `true`. */
	readonly refetchOnWindowFocus?: boolean;
	/**
	 * What to show while the query has no data yet:
	 * - `"suspend"` (default): the result's promise is the query's pending one.
	 * - `"previous"`: keep the last observed query's data, with `isPrevious`.
	 */
	readonly whilePending?: "previous" | "suspend";
}

/** What a reader sees of its query. Replaced, never mutated, on every change. */
export interface Result<TData = unknown> {
	/** Error of the last failed request. Existing data stays readable. */
	readonly error: unknown;
	/** The query's `fetchNextPage`. */
	readonly fetchNextPage: Effect.Effect<void>;
	/** The query's `fetchPreviousPage`. */
	readonly fetchPreviousPage: Effect.Effect<void>;
	/** Stable string form of the observed query's key. */
	readonly hash: string;
	readonly hasNextPage: boolean;
	readonly hasPreviousPage: boolean;
	/** Input of the data in `promise`; differs from the query's while `isPrevious`. */
	readonly input: unknown;
	/** A request is in flight: first load, new input, or background refetch. */
	readonly isFetching: boolean;
	readonly isFetchingNextPage: boolean;
	readonly isFetchingPreviousPage: boolean;
	/** No data yet for the observed query. */
	readonly isPending: boolean;
	/** `promise` holds a previous query's data (`whilePending: "previous"`). */
	readonly isPrevious: boolean;
	/** The data is older than `staleTime`, or was invalidated. */
	readonly isStale: boolean;
	/** Key of the data in `promise`; differs from the query's while `isPrevious`. */
	readonly key: QueryKey;
	/** Settles with the data to show; see `Query.State.promise`. */
	readonly promise: Thenable<TData>;
	/** The query's `refetch`. */
	readonly refetch: Effect.Effect<void>;
	/** When the data in `promise` was fetched (ms since epoch); `0` before that. */
	readonly updatedAt: number;
}

export type ResultKey = keyof Result;

export interface QueryObserver<
	TData = unknown,
	TFactory extends QueryFactory = QueryFactory,
>
	extends Pipeable.Pipeable {
	/** The options set by the latest `make` or {@link setOptionsUnsafe}. */
	readonly options: Options;
	/** The observed query. */
	readonly query: Query.Query<TData, TFactory>;
	readonly [TypeId]: {
		readonly _A: (_: never) => TData;
	};
}

/** Open while the observer has listeners. */
interface Subscription {
	/** At most one polling fiber, restarted when `refetchInterval` changes. */
	readonly polls: FiberHandle.FiberHandle<never, never>;
	/** Owns the query subscription and `polls`. */
	readonly scope: Scope.Closeable;
}

interface Impl<TData, TFactory extends QueryFactory> extends QueryObserver<
	TData,
	TFactory
> {
	current: Result<TData>;
	/** The last observed query that had data, for `whilePending: "previous"`. */
	lastWithData: Query.Query<TData, TFactory> | undefined;
	readonly listeners: Set<() => void>;
	options: Options;
	query: Query.Query<TData, TFactory>;
	subscription: Subscription | undefined;
	/** Result properties a reader has read; empty means notify on any change. */
	readonly trackedProps: Set<ResultKey>;
}

const Proto = {
	...Pipeable.Prototype,
	[TypeId]: { _A: (value: never) => value },
};

const resultKeys = {
	error: true,
	fetchNextPage: true,
	fetchPreviousPage: true,
	hash: true,
	hasNextPage: true,
	hasPreviousPage: true,
	input: true,
	isFetching: true,
	isFetchingNextPage: true,
	isFetchingPreviousPage: true,
	isPending: true,
	isPrevious: true,
	isStale: true,
	key: true,
	promise: true,
	refetch: true,
	updatedAt: true,
} satisfies Record<ResultKey, true>;

export function isQueryObserver(value: unknown): value is QueryObserver {
	return Predicate.hasProperty(value, TypeId);
}

function implOf<TData, TFactory extends QueryFactory>(
	self: QueryObserver<TData, TFactory>,
): Impl<TData, TFactory> {
	// SAFETY: `makeUnsafe` creates every value that carries `TypeId`, and the
	// public `QueryObserver` type is how they leave this module.
	return unsafeCast<Impl<TData, TFactory>>(self);
}

function isResultKey(name: PropertyKey): name is ResultKey {
	return Predicate.isString(name) && Object.hasOwn(resultKeys, name);
}

function shallowEqual(a: Result, b: Result) {
	for (const name of Object.keys(resultKeys)) {
		if (isResultKey(name) && a[name] !== b[name]) {
			return false;
		}
	}
	return true;
}

/** The result for `query` with `options`, given the last query that had data. */
function resultOf<TData, TFactory extends QueryFactory>(
	query: Query.Query<TData, TFactory>,
	options: Options,
	lastWithData: Query.Query<TData, TFactory> | undefined,
): Result<TData> {
	const state = Query.getUnsafe(query);
	const previous =
		options.whilePending === "previous" &&
		!state.hasData &&
		state.status !== "error" &&
		lastWithData !== undefined &&
		lastWithData.hash !== query.hash
			? lastWithData
			: undefined;
	const shown = previous ?? query;
	const shownState = previous ? Query.getUnsafe(previous) : state;
	return {
		error: state.error,
		fetchNextPage: Query.fetchNextPage(query),
		fetchPreviousPage: Query.fetchPreviousPage(query),
		hash: query.hash,
		hasNextPage: Query.hasNextPageUnsafe(query),
		hasPreviousPage: Query.hasPreviousPageUnsafe(query),
		input: shown.handle.input,
		isFetching: state.isFetching,
		isFetchingNextPage: state.fetchDirection === "forward",
		isFetchingPreviousPage: state.fetchDirection === "backward",
		isPending: !state.hasData,
		isPrevious: previous !== undefined,
		isStale: state.isStale,
		key: shown.handle.key,
		promise: shownState.promise,
		refetch: Query.refetch(query),
		updatedAt: shownState.updatedAt,
	};
}

/** Observe `query`. Doesn't subscribe to it until the observer has a listener. */
export function makeUnsafe<TData, TFactory extends QueryFactory>(
	query: Query.Query<TData, TFactory>,
	options: Options = {},
): QueryObserver<TData, TFactory> {
	const self: Impl<TData, TFactory> = Object.assign(Object.create(Proto), {
		current: resultOf(query, options, undefined),
		lastWithData: Query.getUnsafe(query).hasData ? query : undefined,
		listeners: new Set(),
		options,
		query,
		subscription: undefined,
		trackedProps: new Set(),
	});
	return self;
}

/** {@link makeUnsafe}, as an Effect. */
export function make<TData, TFactory extends QueryFactory>(
	query: Query.Query<TData, TFactory>,
	options?: Options,
): Effect.Effect<QueryObserver<TData, TFactory>> {
	return Effect.sync(() => makeUnsafe(query, options));
}

/** The current result. */
export function getUnsafe<TData, TFactory extends QueryFactory>(
	self: QueryObserver<TData, TFactory>,
): Result<TData> {
	return implOf(self).current;
}

/** {@link getUnsafe}, as an Effect. */
export function get<TData, TFactory extends QueryFactory>(
	self: QueryObserver<TData, TFactory>,
): Effect.Effect<Result<TData>> {
	return Effect.sync(() => getUnsafe(self));
}

/**
 * The result for `query` with `options` right now, without switching to
 * them. Bindings call this during render, before `setOptionsUnsafe` commits.
 */
export function getOptimisticResultUnsafe<TData, TFactory extends QueryFactory>(
	self: QueryObserver<TData, TFactory>,
	query: Query.Query<TData, TFactory>,
	options: Options,
): Result<TData> {
	const impl = implOf(self);
	const result = resultOf(query, options, impl.lastWithData);
	if (!shallowEqual(impl.current, result)) {
		impl.current = result;
	}
	return result;
}

/** Observe `query` with `options` from now on. */
export function setOptionsUnsafe<TData, TFactory extends QueryFactory>(
	self: QueryObserver<TData, TFactory>,
	query: Query.Query<TData, TFactory>,
	options: Options,
): void {
	const impl = implOf(self);
	const previous = impl.query;
	const previousInterval = impl.options.refetchInterval;
	impl.query = query;
	impl.options = options;
	if (impl.listeners.size > 0) {
		if (query !== previous) {
			connect(impl);
		} else if (options.refetchInterval !== previousInterval) {
			restartPolling(impl);
		}
	}
	updateResult(impl);
}

/** Listen for result changes. The first listener subscribes to the query. */
export function subscribeUnsafe<TData, TFactory extends QueryFactory>(
	self: QueryObserver<TData, TFactory>,
	listener: () => void,
): () => void {
	const impl = implOf(self);
	impl.listeners.add(listener);
	if (!impl.subscription) {
		connect(impl);
		updateResult(impl);
	}
	return () => {
		if (!impl.listeners.delete(listener) || impl.listeners.size > 0) {
			return;
		}
		disconnect(impl);
	};
}

/**
 * The current result, then every change listeners are notified of. Counts
 * as a listener while the stream runs, so the query counts as read.
 */
export function changes<TData, TFactory extends QueryFactory>(
	self: QueryObserver<TData, TFactory>,
): Stream.Stream<Result<TData>> {
	return listen((push) => {
		let last: Result<TData> | undefined;
		const emit = () => {
			const result = getUnsafe(self);
			if (result !== last) {
				last = result;
				push(result);
			}
		};
		const unsubscribe = subscribeUnsafe(self, emit);
		emit();
		return unsubscribe;
	});
}

/**
 * Wrap `result` so that reading a property marks it tracked. Once any
 * property is tracked, listeners are only notified when a tracked one
 * changes.
 */
export function trackResult<
	TData,
	TFactory extends QueryFactory,
	TResult extends Result<TData>,
>(self: QueryObserver<TData, TFactory>, result: TResult): TResult {
	return new Proxy(result, {
		get: (target, name, receiver) => {
			if (isResultKey(name)) {
				trackProp(self, name);
			}
			// oxlint-disable-next-line anti-slop/no-reflect-get -- a Proxy trap forwarding to its target
			return Reflect.get(target, name, receiver);
		},
	});
}

/** Mark `name` as read, for bindings that track access themselves. */
export function trackProp<TData, TFactory extends QueryFactory>(
	self: QueryObserver<TData, TFactory>,
	name: ResultKey,
): void {
	implOf(self).trackedProps.add(name);
}

/** Recompute the result, and notify listeners if a tracked property changed. */
function updateResult<TData, TFactory extends QueryFactory>(
	self: Impl<TData, TFactory>,
) {
	const previous = self.current;
	const next = resultOf(self.query, self.options, self.lastWithData);
	if (Query.getUnsafe(self.query).hasData) {
		self.lastWithData = self.query;
	}
	if (shallowEqual(previous, next)) {
		return;
	}
	self.current = next;
	if (shouldNotify(self, previous, next)) {
		for (const listener of self.listeners) {
			listener();
		}
	}
}

function shouldNotify<TData, TFactory extends QueryFactory>(
	self: Impl<TData, TFactory>,
	previous: Result,
	next: Result,
) {
	if (self.trackedProps.size === 0) {
		return true;
	}
	for (const name of self.trackedProps) {
		if (previous[name] !== next[name]) {
			return true;
		}
	}
	return false;
}

/**
 * Subscribe to the current query in a new scope under its entry's, and
 * start polling. Replaces any previous subscription.
 */
function connect<TData, TFactory extends QueryFactory>(
	self: Impl<TData, TFactory>,
) {
	disconnect(self);
	const query = self.query;
	const preferences: Query.SubscribeOptions = {
		get refetchOnReconnect() {
			return self.options.refetchOnReconnect;
		},
		get refetchOnWindowFocus() {
			return self.options.refetchOnWindowFocus;
		},
	};
	const scope = Scope.forkUnsafe(entryOf(query).scope);
	// Finalizers run last-in first, so closing the scope unsubscribes before
	// it interrupts the polling fiber.
	const polls = Effect.runSync(
		FiberHandle.make<never, never>().pipe(
			Effect.tap(
				Effect.acquireRelease(
					Effect.sync(() =>
						Query.subscribeUnsafe(query, () => updateResult(self), preferences),
					),
					(unsubscribe) => Effect.sync(unsubscribe),
				),
			),
			Scope.provide(scope),
		),
	);
	self.subscription = { polls, scope };
	restartPolling(self);
}

function disconnect<TData, TFactory extends QueryFactory>(
	self: Impl<TData, TFactory>,
) {
	const subscription = self.subscription;
	self.subscription = undefined;
	if (subscription) {
		Effect.runFork(Scope.close(subscription.scope, Exit.void));
	}
}

/** Run `poll` for the current `refetchInterval`, or stop polling without one. */
function restartPolling<TData, TFactory extends QueryFactory>(
	self: Impl<TData, TFactory>,
) {
	const subscription = self.subscription;
	if (!subscription) {
		return;
	}
	const interval = self.options.refetchInterval;
	const polls = subscription.polls;
	Effect.runForkWith(entryOf(self.query).cache.services)(
		interval !== undefined && Number.isFinite(interval) && interval > 0
			? FiberHandle.run(polls, poll(self.query, interval))
			: FiberHandle.clear(polls),
	);
}

/** Refetch `query` every `interval` ms while the page is visible. */
function poll<TData, TFactory extends QueryFactory>(
	query: Query.Query<TData, TFactory>,
	interval: number,
): Effect.Effect<never> {
	return Effect.gen(function* () {
		const platform = yield* Platform;
		if (platform.isVisibleUnsafe()) {
			yield* Effect.forkChild(Query.refetch(query), {
				startImmediately: true,
			});
		}
	}).pipe(Effect.delay(interval), Effect.forever);
}
