"use client";

import {
	type QueryFactory,
	type QueryHandle,
	type QueryHandleWithData,
	QueryObserver,
	Query,
	type UseQueryOptions,
	type UseQueryThrowOptions,
} from "@raf-query/core";
import { Array as Arr, Equivalence } from "effect";
import { use, useEffect, useState, useSyncExternalStore } from "react";

import { assertSent } from "./query-provider/browser-requests.ts";
import { useQueryClient } from "./provider.tsx";
import {
	queryFor,
	readerTuple,
	type UseQueryResult,
	type UseQueryResultWithData,
} from "./use-query.ts";

/**
 * {@link useQueries}' result: one {@link useQuery} tuple per handle, in the
 * same order. A tuple of handles gives a tuple of results.
 */
export type UseQueriesResult<
	TFactory extends QueryFactory,
	THandles extends ReadonlyArray<QueryHandle<TFactory>>,
	TThrow extends boolean | undefined = undefined,
> = {
	readonly [
		K in keyof THandles
	]: THandles[K] extends QueryHandleWithData<TFactory>
		? UseQueryResultWithData<TFactory, TThrow>
		: UseQueryResult<TFactory, TThrow>;
};

type Observer<TFactory extends QueryFactory> =
	QueryObserver.QueryObserver<TFactory>;

const sameItems = Arr.makeEquivalence(Equivalence.strictEqual<unknown>());

/** `next`, or `current` when it holds the same items, so effects keyed on it rerun only on a change. */
function keep<T>(current: ReadonlyArray<T>, next: ReadonlyArray<T>) {
	return sameItems(current, next) ? current : next;
}

/** The queries and observers of one `useQueries` call's latest render, in handle order. */
interface Lists<TFactory extends QueryFactory> {
	observers: ReadonlyArray<Observer<TFactory>>;
	queries: ReadonlyArray<Query.Query<TFactory>>;
	/** `useSyncExternalStore`'s callbacks for `observers`, made again when they change. */
	subscription: Subscription;
}

/**
 * Remember `queries` and pick one observer per query. An observer keeps
 * following the query it read last, wherever that query moved in the list;
 * the rest are reused in order for new queries, so a list whose inputs
 * change keeps `whilePending: "previous"` data per position.
 */
function update<TFactory extends QueryFactory>(
	lists: Lists<TFactory>,
	queries: ReadonlyArray<Query.Query<TFactory>>,
	options: QueryObserver.Options,
): Lists<TFactory> {
	const free = new Set(lists.observers);
	const kept = queries.map((query) => {
		const observer = [...free].find((item) => item.query.hash === query.hash);
		if (observer) {
			free.delete(observer);
		}
		return observer;
	});
	const leftover = free.values();
	const observers = kept.map(
		(observer, index) =>
			observer ??
			leftover.next().value ??
			QueryObserver.makeUnsafe(queries[index], options),
	);
	lists.queries = keep(lists.queries, queries);
	if (!sameItems(observers, lists.observers)) {
		lists.observers = observers;
		lists.subscription = subscriptionFor(observers);
	}
	return { ...lists };
}

interface Subscription {
	getSnapshot(): ReadonlyArray<QueryObserver.Result>;
	subscribe(onChange: () => void): () => void;
}

function subscriptionFor(
	observers: ReadonlyArray<Observer<QueryFactory>>,
): Subscription {
	let snapshot: ReadonlyArray<QueryObserver.Result> = [];
	return {
		getSnapshot: () => {
			snapshot = keep(snapshot, observers.map(QueryObserver.getUnsafe));
			return snapshot;
		},
		subscribe: (onChange: () => void) => {
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
}

/**
 * Read the queries a list of handles points at: {@link useQuery} for each
 * handle, in a list that can change length between renders. Each item is
 * the `[promise, controls]` tuple `useQuery` returns for that handle, so a
 * component that needs every value calls `use()` on each:
 *
 * ```tsx
 * const postReads = useQueries(postQuery, loaderData.posts);
 * const posts = postReads.map(([postPromise]) => use(postPromise));
 * const busy = postReads.some(([, postState]) => postState.isFetching);
 * ```
 *
 * Each promise behaves as `useQuery`'s: stable while its data doesn't
 * change, a `Result` for an Effect `queryFn` with `throwOnError: false`,
 * and the data itself for a handle from `ensure` or `fetch`. A tuple of
 * handles gives a tuple of results.
 *
 * When each handle renders on its own, a component per handle calling
 * `useQuery` lets each one suspend separately instead.
 */
export function useQueries<
	TFactory extends QueryFactory,
	const THandles extends ReadonlyArray<QueryHandle<TFactory>>,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handles: THandles,
	options: UseQueryOptions &
		UseQueryThrowOptions<TFactory> & { readonly throwOnError?: TThrow } = {},
): UseQueriesResult<TFactory, THandles, TThrow> {
	const client = useQueryClient();
	const [lists] = useState<Lists<TFactory>>(() => ({
		observers: [],
		queries: [],
		subscription: subscriptionFor([]),
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
	const { observers, queries, subscription } = update(lists, read, options);
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
	const reads = observers.map((observer, index) => {
		const [promise, controls] = readerTuple(
			observer,
			QueryObserver.getOptimisticResultUnsafe(
				observer,
				queries[index],
				options,
			),
			throwOnError,
		);
		return ["data" in handles[index] ? use(promise) : promise, controls];
	});
	// SAFETY: each item is what `useQuery` returns for its handle (see
	// `readerTuple`), and `UseQueriesResult` maps each handle to that.
	return reads as unknown as UseQueriesResult<TFactory, THandles, TThrow>;
}
