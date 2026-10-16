import {
	type InputArgs,
	promiseControls,
	Query,
	type QueryClient,
	type QueryFactory,
	type QueryHandle,
	type QueryHandleWithData,
	QueryObserver,
	type ReadValue,
	resultThenable,
	type Thenable,
	type UseQueryControls,
	type UseQueryOptions,
	type UseQueryThrowOptions,
} from "@raf-query/core";
import { Result } from "effect";
import {
	computed,
	type MaybeRefOrGetter,
	onScopeDispose,
	shallowRef,
	toValue,
	watch,
} from "vue";

import { useQueryClient } from "./provider.ts";

/** {@link useQuery}'s options: the observer's, and `throwOnError` for typed errors. */
export type UseQueryReadOptions<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> = UseQueryOptions &
	UseQueryThrowOptions<TFactory> & { readonly throwOnError?: TThrow };

/**
 * What {@link useQuery} returns: the query's controls, the `promise` of the
 * data to show, and that `data` once it's there. Read its properties in a
 * template, `computed` or `watch`; destructuring reads them once.
 */
export type UseQueryResult<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> = UseQueryControls<TFactory> & {
	/** The promise's data once it has settled, else `undefined`. */
	readonly data: ReadValue<TFactory, TThrow> | undefined;
	/**
	 * Settles with the data to show, for `await` in an async `setup` under
	 * `<Suspense>`. A new promise per data version, already settled once the
	 * cache has data.
	 */
	readonly promise: Promise<ReadValue<TFactory, TThrow>>;
};

/** {@link useQuery}'s result for a handle from `ensure` or `fetch`. */
export type UseQueryResultWithData<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> = UseQueryResult<TFactory, TThrow> & {
	/** The query's data. The handle's `data` until the cache has data again. */
	readonly data: ReadValue<TFactory, TThrow>;
};

function queryFor<TFactory extends QueryFactory>(
	client: QueryClient<unknown>,
	factory: TFactory,
	input: unknown,
): Query.Query<TFactory> {
	// SAFETY: `input` is a handle's input, and handles are typed to the
	// factory they were created through (`QueryHandle<TFactory>`).
	const args = [input] as InputArgs<TFactory>;
	return client.getQuery(factory, ...args);
}

function observerOptions(options: UseQueryOptions): UseQueryOptions {
	return {
		refetchInterval: options.refetchInterval,
		refetchOnReconnect: options.refetchOnReconnect,
		refetchOnWindowFocus: options.refetchOnWindowFocus,
		whilePending: options.whilePending,
	};
}

/**
 * Read the query a handle points at. Call it in `setup`, with the handle
 * as a ref or getter when it changes (a route's loader data):
 *
 * ```ts
 * const post = useQuery(postQuery, () => props.post);
 * ```
 *
 * ```vue
 * <h1 v-if="post.data">{{ post.data.title }}</h1>
 * ```
 *
 * `data` is `undefined` until the promise settles. Under `<Suspense>`,
 * await the promise in an async `setup` instead, and `data` is there on
 * the first render (and in the server's HTML):
 *
 * ```ts
 * const post = useQuery(postQuery, () => props.post);
 * await post.promise;
 * ```
 *
 * A handle from `ensure` or `fetch` already has its data, so `data` is
 * never `undefined` for it.
 *
 * For an Effect `queryFn` (typed `ErrorOf`), with the client's
 * `throwOnError: false` (the default when it has a `layer`), `data` and the
 * promise hold a `Result` instead, and the promise never rejects.
 *
 * The result follows the cache: a refetch, `setData` or invalidation
 * updates what reads it. A component re-renders only when a property it
 * read changed.
 */
export function useQuery<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handle: MaybeRefOrGetter<QueryHandleWithData<TFactory>>,
	options?: MaybeRefOrGetter<UseQueryReadOptions<TFactory, TThrow>>,
): UseQueryResultWithData<TFactory, TThrow>;
export function useQuery<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handle: MaybeRefOrGetter<QueryHandle<TFactory>>,
	options?: MaybeRefOrGetter<UseQueryReadOptions<TFactory, TThrow>>,
): UseQueryResult<TFactory, TThrow>;
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: MaybeRefOrGetter<QueryHandle<TFactory>>,
	options: MaybeRefOrGetter<
		UseQueryOptions & { readonly throwOnError?: boolean }
	> = {},
): UseQueryResult<TFactory, boolean> {
	const client = useQueryClient();
	const currentHandle = computed(() => toValue(handle));
	const currentOptions = computed(() => toValue(options));
	const query = computed(() =>
		queryFor(client, factory, currentHandle.value.input),
	);
	const observer = QueryObserver.makeUnsafe(
		query.value,
		observerOptions(currentOptions.value),
	);
	// Synchronous, so a new handle's query is read and observed before
	// anything renders the result.
	watch(
		[query, currentOptions],
		([nextQuery, nextOptions]) => {
			Query.readUnsafe(nextQuery);
			QueryObserver.setOptionsUnsafe(
				observer,
				nextQuery,
				observerOptions(nextOptions),
			);
		},
		{ flush: "sync", immediate: true },
	);

	const version = shallowRef(0);
	// A server render reads once and never unmounts, so it doesn't subscribe.
	if (!client.isServer) {
		onScopeDispose(
			QueryObserver.subscribeUnsafe(observer, () => {
				version.value += 1;
			}),
		);
	}

	function read(name: QueryObserver.ResultKey): QueryObserver.Result {
		// Tracks the version, so whatever reads a property re-runs on changes.
		void version.value;
		QueryObserver.trackProp(observer, name);
		return client.isServer
			? QueryObserver.getOptimisticResultUnsafe(
					observer,
					query.value,
					observerOptions(currentOptions.value),
				)
			: QueryObserver.getUnsafe(observer);
	}

	// A promise settles in place, so the result doesn't change when it does;
	// whatever read a pending one re-runs when it settles.
	const awaited = new WeakSet<PromiseLike<unknown>>();
	function shown(): Thenable<unknown> {
		const promise = read("promise").promise;
		if (promise.status === "pending" && !awaited.has(promise)) {
			awaited.add(promise);
			const settled = () => {
				version.value += 1;
			};
			promise.then(settled, settled);
		}
		const throwOnError =
			currentOptions.value.throwOnError ?? client.throwOnError;
		return throwOnError ? promise : resultThenable(promise);
	}

	function controls() {
		return promiseControls(QueryObserver.getUnsafe(observer));
	}

	const result = {
		get data() {
			const promise = shown();
			if (promise.status === "fulfilled") {
				return promise.value;
			}
			const current = currentHandle.value;
			if (!("data" in current)) {
				return undefined;
			}
			const throwOnError =
				currentOptions.value.throwOnError ?? client.throwOnError;
			return throwOnError ? current.data : Result.succeed(current.data);
		},
		get error() {
			return read("error").error;
		},
		fetchNextPage: () => controls().fetchNextPage(),
		fetchPreviousPage: () => controls().fetchPreviousPage(),
		get hash() {
			return read("hash").hash;
		},
		get hasNextPage() {
			return read("hasNextPage").hasNextPage;
		},
		get hasPreviousPage() {
			return read("hasPreviousPage").hasPreviousPage;
		},
		get input() {
			return read("input").input;
		},
		get isFetching() {
			return read("isFetching").isFetching;
		},
		get isFetchingNextPage() {
			return read("isFetchingNextPage").isFetchingNextPage;
		},
		get isFetchingPreviousPage() {
			return read("isFetchingPreviousPage").isFetchingPreviousPage;
		},
		get isPending() {
			return read("isPending").isPending;
		},
		get isPrevious() {
			return read("isPrevious").isPrevious;
		},
		get isStale() {
			return read("isStale").isStale;
		},
		get key() {
			return read("key").key;
		},
		get promise() {
			return shown();
		},
		refetch: () => controls().refetch(),
		get updatedAt() {
			return read("updatedAt").updatedAt;
		},
	};
	// SAFETY: `data` and `promise` hold this factory's data, or a `Result` of
	// it when the read doesn't throw, and the object has every control of
	// both shapes; the overloads pick the shape from the handle's type.
	return result as unknown as UseQueryResult<TFactory, boolean>;
}
