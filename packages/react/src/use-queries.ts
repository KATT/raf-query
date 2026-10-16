"use client";

import {
	fulfilled,
	pending,
	promiseControls,
	type QueryFactory,
	type QueryHandle,
	QueryObserver,
	Query,
	type ReadValue,
	resultThenable,
	type Thenable,
	type UseQueryControls,
	type UseQueryOptions,
	type UseQueryThrowOptions,
} from "@raf-query/core";
import { useEffect, useState, useSyncExternalStore } from "react";

import { assertSent } from "./query-provider/browser-requests.ts";
import { useQueryClient } from "./provider.tsx";
import { queryFor } from "./use-query.ts";

export type UseQueriesResult<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> = readonly [
	promise: Promise<ReadonlyArray<ReadValue<TFactory, TThrow>>>,
	controls: ReadonlyArray<UseQueryControls<TFactory>>,
];

type Observer<TFactory extends QueryFactory> =
	QueryObserver.QueryObserver<TFactory>;

/**
 * The queries and observers of one `useQueries` call's latest render, in
 * handle order. Each list keeps its identity while its items do, so effects
 * and the subscription only rerun when one changes.
 */
interface Store<TFactory extends QueryFactory> {
	observers: ReadonlyArray<Observer<TFactory>>;
	queries: ReadonlyArray<Query.Query<TFactory>>;
}

function sameItems<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>) {
	return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Remember `queries` and pick one observer per query. An observer keeps
 * following the query it read last, wherever that query moved in the list;
 * the rest are reused in order for new queries, so a list whose inputs
 * change keeps `whilePending: "previous"` data per position.
 */
function update<TFactory extends QueryFactory>(
	store: Store<TFactory>,
	queries: ReadonlyArray<Query.Query<TFactory>>,
	options: QueryObserver.Options,
): Store<TFactory> {
	if (!sameItems(queries, store.queries)) {
		store.queries = queries;
	}
	const free = new Set(store.observers);
	const kept = store.queries.map((query) => {
		for (const observer of free) {
			if (observer.query.hash === query.hash) {
				free.delete(observer);
				return observer;
			}
		}
		return undefined;
	});
	const leftover = free.values();
	const observers = kept.map(
		(observer, index) =>
			observer ??
			leftover.next().value ??
			QueryObserver.makeUnsafe(store.queries[index], options),
	);
	if (!sameItems(observers, store.observers)) {
		store.observers = observers;
	}
	return { observers: store.observers, queries: store.queries };
}

/** `useSyncExternalStore`'s callbacks for one list of observers. */
interface Subscription {
	getSnapshot(): ReadonlyArray<QueryObserver.Result>;
	subscribe(onChange: () => void): () => void;
}

const subscriptions = new WeakMap<
	ReadonlyArray<Observer<QueryFactory>>,
	Subscription
>();

function subscriptionFor(
	observers: ReadonlyArray<Observer<QueryFactory>>,
): Subscription {
	const cached = subscriptions.get(observers);
	if (cached) {
		return cached;
	}
	let snapshot: ReadonlyArray<QueryObserver.Result> = [];
	const subscription: Subscription = {
		getSnapshot: () => {
			const next = observers.map((observer) =>
				QueryObserver.getUnsafe(observer),
			);
			if (!sameItems(next, snapshot)) {
				snapshot = next;
			}
			return snapshot;
		},
		subscribe: (onChange) => {
			const unsubscribes = observers.map((observer) =>
				QueryObserver.subscribeUnsafe(observer, onChange),
			);
			return () => {
				for (const unsubscribe of unsubscribes) {
					unsubscribe();
				}
			};
		},
	};
	subscriptions.set(observers, subscription);
	return subscription;
}

/** Every part's value, or `undefined` while one hasn't fulfilled. */
function valuesOf<T>(parts: ReadonlyArray<Thenable<T>>): Array<T> | undefined {
	const values: Array<T> = [];
	for (const part of parts) {
		if (part.status !== "fulfilled") {
			return undefined;
		}
		values.push(part.value);
	}
	return values;
}

const noData = fulfilled<ReadonlyArray<never>>([]);

const combined = new WeakMap<
	Thenable<unknown>,
	{
		readonly all: Thenable<ReadonlyArray<unknown>>;
		readonly parts: ReadonlyArray<Thenable<unknown>>;
	}
>();

/**
 * `Promise.all` of `parts`, as a thenable that is settled already when they
 * are. The same parts give the same thenable, so `use()` sees one promise
 * until one of them changes.
 */
function allOf<T>(
	parts: ReadonlyArray<Thenable<T>>,
): Thenable<ReadonlyArray<T>> {
	const first = parts[0];
	if (first === undefined) {
		return noData;
	}
	const cached = combined.get(first);
	if (cached && sameItems(cached.parts, parts)) {
		// SAFETY: stored under the same parts, so it holds their values.
		return cached.all as Thenable<ReadonlyArray<T>>;
	}
	let all: Thenable<ReadonlyArray<T>>;
	const rejected = parts.find((part) => part.status === "rejected");
	const values = valuesOf(parts);
	if (rejected?.status === "rejected") {
		const deferred = pending<ReadonlyArray<T>>();
		deferred.reject(rejected.reason);
		all = deferred.promise;
	} else if (values) {
		all = fulfilled(values);
	} else {
		const deferred = pending<ReadonlyArray<T>>();
		Promise.all(parts).then(deferred.resolve, deferred.reject);
		all = deferred.promise;
	}
	combined.set(first, { all, parts });
	return all;
}

/**
 * Read the queries a list of handles points at, for a component that needs
 * all of them at once: a total, a chart, a side-by-side comparison. Returns
 * one promise of every query's data, in handle order, and each query's
 * controls:
 *
 * ```tsx
 * const [postsPromise, postStates] = useQueries(postQuery, loaderData.posts);
 * const posts = use(postsPromise);
 * ```
 *
 * The promise is stable while no query's data changes and already
 * fulfilled once every query has data, so `use()` only suspends while one
 * has nothing to show. It rejects when a first load fails, like
 * `Promise.all`. For an Effect `queryFn` with `throwOnError: false`, it
 * holds a `Result` per query instead and never rejects.
 *
 * The list can change length between renders. Like `useQuery`, it never
 * refetches on mount. Handles from `ensure` or `fetch` have their data, so
 * the promise is fulfilled already and `use()` returns at once.
 *
 * When each handle renders on its own, a component per handle calling
 * `useQuery` lets each one suspend separately instead.
 */
export function useQueries<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handles: ReadonlyArray<QueryHandle<TFactory>>,
	options: UseQueryOptions &
		UseQueryThrowOptions<TFactory> & { readonly throwOnError?: TThrow } = {},
): UseQueriesResult<TFactory, TThrow> {
	const client = useQueryClient();
	const [store] = useState<Store<TFactory>>(() => ({
		observers: [],
		queries: [],
	}));
	const read = handles.map((handle) => {
		const query = queryFor(client, factory, handle.input);
		assertSent(client, query);
		Query.readUnsafe(query);
		return query;
	});

	const refetchInterval = options.refetchInterval;
	const refetchOnReconnect = options.refetchOnReconnect;
	const refetchOnWindowFocus = options.refetchOnWindowFocus;
	const whilePending = options.whilePending;
	const { observers, queries } = update(store, read, options);
	const results = observers.map((observer, index) =>
		QueryObserver.getOptimisticResultUnsafe(observer, queries[index], options),
	);
	const subscription = subscriptionFor(observers);
	useSyncExternalStore(
		subscription.subscribe,
		subscription.getSnapshot,
		subscription.getSnapshot,
	);
	useEffect(() => {
		const committed = {
			refetchInterval,
			refetchOnReconnect,
			refetchOnWindowFocus,
			whilePending,
		};
		for (const [index, observer] of observers.entries()) {
			QueryObserver.setOptionsUnsafe(observer, queries[index], committed);
		}
	}, [
		observers,
		queries,
		refetchInterval,
		refetchOnReconnect,
		refetchOnWindowFocus,
		whilePending,
	]);

	const throwOnError = options.throwOnError ?? client.throwOnError;
	const controls = observers.map((observer, index) => {
		// The promise is folded into the combined one, where reads can't be
		// seen, so it always counts as read.
		QueryObserver.trackProp(observer, "promise");
		return promiseControls(QueryObserver.trackResult(observer, results[index]));
	});
	const parts = results.map((result): Thenable<unknown> =>
		throwOnError ? result.promise : resultThenable(result.promise),
	);
	// SAFETY: each part is its query's data promise (or its `Result` thenable
	// when `throwOnError` is false), the shape `ReadValue` picks, and every
	// control has every field of both control shapes.
	return [allOf(parts), controls] as unknown as UseQueriesResult<
		TFactory,
		TThrow
	>;
}
