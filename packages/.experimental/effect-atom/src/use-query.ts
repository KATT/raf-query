"use client";

import type {
	DataOf,
	EnsuredQueryHandle,
	ErrorOf,
	InputOf,
	QueryHandle,
	QueryKey,
	Thenable,
} from "@raf-query/core";
import { Cause, Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { use, useCallback, useSyncExternalStore } from "react";

import { unsafeCast } from "./cast.ts";
import type { QueryFactory } from "./client.ts";
import * as Entry from "./entry.ts";
import { useQueryClient } from "./provider.tsx";
import { promiseFor } from "./thenable.ts";

/** The second element of {@link useQuery}'s result. */
export interface QueryControls<TFactory extends QueryFactory> {
	/** Error of the last failed request. Existing data stays readable. */
	readonly error: ErrorOf<TFactory> | null;
	/** Stable string form of the handle's key, for `key` props. */
	readonly hash: string;
	/** Input of the data in the promise. */
	readonly input: InputOf<TFactory>;
	/** A request is in flight: first load, retry, or background refetch. */
	readonly isFetching: boolean;
	/** No data yet for the handle's input. */
	readonly isPending: boolean;
	/** The data is older than `staleTime`, or was invalidated. */
	readonly isStale: boolean;
	/** Key of the data in the promise. */
	readonly key: QueryKey;
	/** Refetch now. Resolves when the request settles; never rejects. */
	refetch(): Promise<void>;
	/** When the data in the promise was fetched or set (ms since epoch); `0` before that. */
	readonly updatedAt: number;
}

export type UseQueryResult<TFactory extends QueryFactory> = readonly [
	promise: Thenable<DataOf<TFactory>>,
	controls: QueryControls<TFactory>,
];

/** {@link useQuery}'s result for a handle from `ensure`. */
export type UseEnsuredQueryResult<TFactory extends QueryFactory> = readonly [
	data: DataOf<TFactory>,
	controls: QueryControls<TFactory>,
];

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
): UseEnsuredQueryResult<TFactory>;
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
): UseQueryResult<TFactory>;
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: EnsuredQueryHandle<TFactory> | QueryHandle<TFactory>,
): UseEnsuredQueryResult<TFactory> | UseQueryResult<TFactory> {
	const client = useQueryClient();
	// SAFETY: `handle.input` is typed to the factory's input through
	// `QueryHandle<TFactory>`.
	const args = unsafeCast<[input: InputOf<TFactory>]>([handle.input]);
	const entry = client.getQuery(factory, ...args);
	const registry = client.registry;
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
	const promise = promiseFor(entry, result);
	const controls = {
		error: errorOf(result),
		hash: entry.hash,
		input: handle.input,
		isFetching: result.waiting,
		isPending: Option.isNone(AsyncResult.value(result)),
		isStale: Entry.isStaleUnsafe(entry, result),
		key: entry.options.queryKey,
		refetch: entry.refetch,
		updatedAt: Entry.updatedAt(result) ?? 0,
	};
	// SAFETY: the entry under this factory's key holds this factory's data,
	// fails with its `queryFn`'s errors, and `input` is the handle's.
	const typed = unsafeCast<QueryControls<TFactory>>(controls);
	if (handle.ensured) {
		// SAFETY: as above, for the promise's value.
		return [unsafeCast<DataOf<TFactory>>(use(promise)), typed];
	}
	// SAFETY: as above.
	return [unsafeCast<Thenable<DataOf<TFactory>>>(promise), typed];
}
