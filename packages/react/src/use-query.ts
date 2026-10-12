"use client";

import type {
	DataOf,
	InputArgs,
	InputOf,
	IsPaged,
	Query,
	QueryClient,
	QueryFactory,
	QueryHandle,
	QueryKey,
	Thenable,
} from "@raf-query/core";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { unsafeCast } from "./cast.ts";
import { useQueryClient } from "./provider.tsx";

export interface UseQueryOptions {
	/** Refetch on this interval (ms) while mounted and the page is visible. */
	readonly refetchInterval?: number;
	/** Refetch on reconnect while stale. Default: the query's option, else `true`. */
	readonly refetchOnReconnect?: boolean;
	/** Refetch on window focus while stale. Default: the query's option, else `true`. */
	readonly refetchOnWindowFocus?: boolean;
	/**
	 * What to render while the handle's input has no data yet:
	 * - `"suspend"` (default): the promise is pending, so `unwrap()` suspends.
	 * - `"previous"`: keep returning the last input's data, with `isPrevious`.
	 */
	readonly whilePending?: "previous" | "suspend";
}

/** The second element of {@link useQuery}'s result. */
export interface QueryControls<TFactory extends QueryFactory> {
	/** Error of the last failed request. Existing data stays readable. */
	readonly error: unknown;
	/** Stable string form of the handle's key, for `key` props. */
	readonly hash: string;
	/** Input of the data in the promise; differs from the handle's while `isPrevious`. */
	readonly input: InputOf<TFactory>;
	/** A request is in flight: first load, new input, or background refetch. */
	readonly isFetching: boolean;
	/** No data yet for the handle's input. */
	readonly isPending: boolean;
	/** The promise holds a previous input's data (`whilePending: "previous"`). */
	readonly isPrevious: boolean;
	/** The data is older than `staleTime`, or was invalidated. */
	readonly isStale: boolean;
	/** Key of the data in the promise; differs from the handle's while `isPrevious`. */
	readonly key: QueryKey;
	/** Refetch now. Resolves when the request settles; never rejects. */
	refetch(): Promise<void>;
	/** When the data in the promise was fetched (ms since epoch); `0` before that. */
	readonly updatedAt: number;
}

/** Extra controls for factories that return `infiniteQueryOptions(...)`. */
export interface PagingControls {
	fetchNextPage(): Promise<void>;
	fetchPreviousPage(): Promise<void>;
	readonly hasNextPage: boolean;
	readonly hasPreviousPage: boolean;
	readonly isFetchingNextPage: boolean;
	readonly isFetchingPreviousPage: boolean;
}

export type UseQueryControls<TFactory extends QueryFactory> =
	IsPaged<TFactory> extends true
		? QueryControls<TFactory> & PagingControls
		: QueryControls<TFactory>;

export type UseQueryResult<TFactory extends QueryFactory> = readonly [
	promise: Thenable<DataOf<TFactory>>,
	controls: UseQueryControls<TFactory>,
];

interface Shown {
	readonly handle: { readonly input: unknown; readonly key: QueryKey };
	readonly hash: string;
	readonly promise: Thenable<unknown>;
	readonly updatedAt: number;
}

export function queryFor<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	input: unknown,
): Query<DataOf<TFactory>, TFactory> {
	// SAFETY: `input` is a handle's input, and handles are typed to the
	// factory they were created through (`QueryHandle<TFactory>`).
	// oxlint-disable-next-line typescript/consistent-type-assertions
	const args = [input] as InputArgs<TFactory>;
	return client.getQuery(factory, ...args);
}

function useRefetchInterval(
	query: { refetch(): Promise<void> },
	interval: number | undefined,
) {
	useEffect(() => {
		if (interval === undefined || !Number.isFinite(interval) || interval <= 0) {
			return;
		}
		const timer = setInterval(() => {
			if (document.visibilityState !== "hidden") {
				void query.refetch();
			}
		}, interval);
		return () => clearInterval(timer);
	}, [query, interval]);
}

/**
 * Read the query a handle points at. Returns a promise to read with
 * `unwrap()` (or `use()`) and the query's controls:
 *
 * ```tsx
 * const [postPromise, postState] = useQuery(postQuery, loaderData.post);
 * const post = unwrap(postPromise);
 * ```
 *
 * The promise is stable per data version and already fulfilled once the
 * cache has data, so reading it only suspends while there is nothing to show.
 */
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	options: UseQueryOptions = {},
): UseQueryResult<TFactory> {
	const client = useQueryClient();
	const query = queryFor(client, factory, handle.input);
	query.read();

	const refetchOnReconnect = options.refetchOnReconnect;
	const refetchOnWindowFocus = options.refetchOnWindowFocus;
	const subscribe = useCallback(
		(onChange: () => void) =>
			query.subscribe(onChange, { refetchOnReconnect, refetchOnWindowFocus }),
		[query, refetchOnReconnect, refetchOnWindowFocus],
	);
	const state = useSyncExternalStore(subscribe, query.getState, query.getState);
	useRefetchInterval(query, options.refetchInterval);

	const keepPrevious = options.whilePending === "previous";
	const [lastShown, setLastShown] = useState<Shown | undefined>(undefined);
	if (keepPrevious && state.hasData && lastShown?.promise !== state.promise) {
		setLastShown({
			handle: query.handle,
			hash: query.hash,
			promise: state.promise,
			updatedAt: state.updatedAt,
		});
	}
	const previous =
		keepPrevious &&
		!state.hasData &&
		state.status !== "error" &&
		lastShown !== undefined &&
		lastShown.hash !== query.hash
			? lastShown
			: undefined;

	const shown: Shown = previous ?? {
		handle: query.handle,
		hash: query.hash,
		promise: state.promise,
		updatedAt: state.updatedAt,
	};
	const controls = {
		error: state.error,
		fetchNextPage: query.fetchNextPage,
		fetchPreviousPage: query.fetchPreviousPage,
		hash: query.hash,
		hasNextPage: query.hasNextPage(),
		hasPreviousPage: query.hasPreviousPage(),
		input: shown.handle.input,
		isFetching: state.isFetching,
		isFetchingNextPage: state.fetchDirection === "forward",
		isFetchingPreviousPage: state.fetchDirection === "backward",
		isPending: !state.hasData,
		isPrevious: previous !== undefined,
		isStale: state.isStale,
		key: shown.handle.key,
		refetch: query.refetch,
		updatedAt: shown.updatedAt,
	} satisfies Record<
		keyof QueryControls<QueryFactory> | keyof PagingControls,
		unknown
	>;
	// SAFETY: `shown.promise` is this factory's entry's promise (or an earlier
	// input's entry of the same factory), and `controls` has every field of
	// both control shapes.
	return unsafeCast<UseQueryResult<TFactory>>([shown.promise, controls]);
}
