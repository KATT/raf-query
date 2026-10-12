"use client";

import type { QueryKey, Thenable } from "@raf-query/core";
import { Cause, Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import {
	use,
	useCallback,
	useEffect,
	useState,
	useSyncExternalStore,
} from "react";

import { unsafeCast } from "./cast.ts";
import * as Entry from "./entry.ts";
import type {
	DataOf,
	EnsuredQueryHandle,
	ErrorOf,
	InputOf,
	IsPaged,
	QueryFactory,
	QueryHandle,
} from "./options.ts";
import { useQueryClient } from "./provider.tsx";
import { promiseFor } from "./thenable.ts";

/** How one component reads its query. */
export interface UseQueryOptions {
	/**
	 * What to show while the handle's query has no data yet:
	 * - `"suspend"` (default): the promise is the query's pending one.
	 * - `"previous"`: keep the data this component showed last, with
	 *   `isPrevious`.
	 */
	readonly whilePending?: "previous" | "suspend";
}

interface BaseControls<TFactory extends QueryFactory> {
	/**
	 * Error of the last failed request, squashed from its `Cause`: a typed
	 * failure or a defect. Existing data stays readable. `result` has the
	 * whole `Cause`.
	 */
	readonly error: unknown;
	/** Stable string form of the handle's key, for `key` props. */
	readonly hash: string;
	/** Input of the data in the promise; differs from the handle's while `isPrevious`. */
	readonly input: InputOf<TFactory>;
	/** A request is in flight: first load, retry, or background refetch. */
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
	/**
	 * The query atom's current `AsyncResult`, for rendering with
	 * `AsyncResult.match` / `AsyncResult.builder` instead of suspending, or
	 * for matching on the failure's `Cause`.
	 */
	readonly result: AsyncResult.AsyncResult<DataOf<TFactory>, ErrorOf<TFactory>>;
	/** When the data in the promise was fetched or set (ms since epoch); `0` before that. */
	readonly updatedAt: number;
}

/** Controls of a paged query. */
export interface PagingControls {
	/** Load the page after the last one. Resolves when it settles; never rejects. */
	fetchNextPage(): Promise<void>;
	/** Load the page before the first one. Resolves when it settles; never rejects. */
	fetchPreviousPage(): Promise<void>;
	readonly hasNextPage: boolean;
	readonly hasPreviousPage: boolean;
	readonly isFetchingNextPage: boolean;
	readonly isFetchingPreviousPage: boolean;
}

/** The second element of {@link useQuery}'s result. Paged factories add {@link PagingControls}. */
export type QueryControls<TFactory extends QueryFactory> =
	BaseControls<TFactory> &
		(IsPaged<TFactory> extends true ? PagingControls : unknown);

export type UseQueryResult<TFactory extends QueryFactory> = readonly [
	promise: Thenable<DataOf<TFactory>>,
	controls: QueryControls<TFactory>,
];

/** {@link useQuery}'s result for a handle from `ensure`. */
export type UseEnsuredQueryResult<TFactory extends QueryFactory> = readonly [
	data: DataOf<TFactory>,
	controls: QueryControls<TFactory>,
];

/** What a component last showed with data, for `whilePending: "previous"`. */
interface Shown {
	readonly entry: Entry.Entry;
	readonly input: unknown;
	readonly promise: Thenable<unknown>;
	readonly updatedAt: number;
}

function lastShown() {
	let last: Shown | undefined;
	return {
		get: () => last,
		set: (shown: Shown) => {
			last = shown;
		},
	};
}

function errorOf(result: Entry.Result): unknown {
	return AsyncResult.isFailure(result) ? Cause.squash(result.cause) : null;
}

/**
 * Read the query a handle points at. Returns a promise to unwrap with
 * `use()` and the query's controls:
 *
 * ```tsx
 * const [postPromise, postState] = useQuery(postQuery, loaderData.post);
 * const post = use(postPromise);
 * ```
 *
 * The component subscribes to the query's atom. The promise is stable per
 * data version and already fulfilled once the atom has data, so `use()`
 * only suspends while there is nothing to show. A handle from `ensure`
 * returns the data itself, suspending only if the entry lost it since.
 */
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: EnsuredQueryHandle<TFactory>,
	options?: UseQueryOptions,
): UseEnsuredQueryResult<TFactory>;
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	options?: UseQueryOptions,
): UseQueryResult<TFactory>;
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: EnsuredQueryHandle<TFactory> | QueryHandle<TFactory>,
	options?: UseQueryOptions,
): UseEnsuredQueryResult<TFactory> | UseQueryResult<TFactory> {
	const client = useQueryClient();
	// SAFETY: `handle.input` is typed to the factory's input through
	// `QueryHandle<TFactory>`.
	const args = unsafeCast<[input: InputOf<TFactory>]>([handle.input]);
	const entry = client.effect.getQueryUnsafe(factory, ...args);
	const registry = client.registry;
	const [shown] = useState(lastShown);
	const subscribe = useCallback(
		(onChange: () => void) =>
			registry.subscribe(entry.read, () => {
				onChange();
			}),
		[registry, entry],
	);
	const getSnapshot = useCallback(
		() => registry.get(entry.read),
		[registry, entry],
	);
	const result = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	const isPending = Option.isNone(AsyncResult.value(result));
	const last = shown.get();
	const previous =
		options?.whilePending === "previous" &&
		isPending &&
		!AsyncResult.isFailure(result) &&
		last !== undefined &&
		last.entry.hash !== entry.hash
			? last
			: undefined;
	const promise = previous?.promise ?? promiseFor(entry, result);
	const updatedAt = previous?.updatedAt ?? Entry.updatedAt(result) ?? 0;
	const input = handle.input;
	useEffect(() => {
		if (!isPending) {
			shown.set({ entry, input, promise, updatedAt });
		}
	}, [entry, input, isPending, promise, shown, updatedAt]);
	const controls = {
		error: errorOf(result),
		fetchNextPage: entry.fetchNextPage,
		fetchPreviousPage: entry.fetchPreviousPage,
		hash: entry.hash,
		hasNextPage: Entry.hasNextPageUnsafe(entry, result),
		hasPreviousPage: Entry.hasPreviousPageUnsafe(entry, result),
		input: previous ? previous.input : input,
		isFetching: result.waiting,
		isFetchingNextPage: result.waiting && entry.fetchDirection === "forward",
		isFetchingPreviousPage:
			result.waiting && entry.fetchDirection === "backward",
		isPending,
		isPrevious: previous !== undefined,
		isStale: Entry.isStaleUnsafe(entry, result),
		key: previous ? previous.entry.options.queryKey : entry.options.queryKey,
		refetch: entry.refetch,
		result,
		updatedAt,
	};
	// SAFETY: the entry under this factory's key holds this factory's data,
	// fails with its `queryFn`'s errors (`result`), and `input` is the
	// handle's or, while `isPrevious`, an earlier handle's of this factory.
	// Paging controls are only typed for paged factories.
	const typed = unsafeCast<QueryControls<TFactory>>(controls);
	if (handle.ensured) {
		// SAFETY: as above, for the promise's value.
		return [unsafeCast<DataOf<TFactory>>(use(promise)), typed];
	}
	// SAFETY: as above.
	return [unsafeCast<Thenable<DataOf<TFactory>>>(promise), typed];
}
