"use client";

import {
	type DataOf,
	type EnsuredQueryHandle,
	type InputArgs,
	type InputOf,
	type IsPaged,
	type QueryFactory,
	type QueryHandle,
	type QueryKey,
	QueryObserver,
	type Thenable,
	Query,
} from "@raf-query/core";
import { Effect } from "effect";
import { use, useEffect, useState, useSyncExternalStore } from "react";

import { assertSent } from "./browser-requests.ts";
import type { QueryClient } from "./client.ts";
import { useQueryClient } from "./provider.tsx";

/** `refetchInterval`, `refetchOnWindowFocus`, `refetchOnReconnect`, `whilePending`. */
export type UseQueryOptions = QueryObserver.Options;

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

/** {@link useQuery}'s result for a handle from `ensure`. */
export type UseEnsuredQueryResult<TFactory extends QueryFactory> = readonly [
	data: DataOf<TFactory>,
	controls: UseQueryControls<TFactory>,
];

export function queryFor<TFactory extends QueryFactory>(
	client: QueryClient<unknown>,
	factory: TFactory,
	input: unknown,
): Query.Query<TFactory> {
	// SAFETY: `input` is a handle's input, and handles are typed to the
	// factory they were created through (`QueryHandle<TFactory>`).
	const args = [input] as InputArgs<TFactory>;
	return client.getQuery(factory, ...args);
}

const commands = new WeakMap<Effect.Effect<void>, () => Promise<void>>();

/** One stable Promise function per command Effect, so identities track the query's. */
function commandFor(effect: Effect.Effect<void>): () => Promise<void> {
	let command = commands.get(effect);
	if (!command) {
		command = () => Effect.runPromise(effect);
		commands.set(effect, command);
	}
	return command;
}

type Command = "fetchNextPage" | "fetchPreviousPage" | "refetch";

type PromiseCommands = Omit<QueryObserver.Result, Command> &
	Record<Command, () => Promise<void>>;

/** `tracked`, with the observer's command Effects as Promise functions. */
function withPromiseCommands(tracked: QueryObserver.Result): PromiseCommands {
	const proxied = new Proxy(tracked, {
		get: (target, name, receiver) => {
			if (
				name === "fetchNextPage" ||
				name === "fetchPreviousPage" ||
				name === "refetch"
			) {
				return commandFor(target[name]);
			}
			// oxlint-disable-next-line anti-slop/no-reflect-get -- a Proxy trap forwarding to its target
			return Reflect.get(target, name, receiver);
		},
	});
	// SAFETY: the trap above replaces exactly the `Command` properties with
	// Promise functions and forwards every other read.
	return proxied as unknown as PromiseCommands;
}

/** An observer, with the stable callbacks `useSyncExternalStore` needs. */
interface ObserverStore<TFactory extends QueryFactory> {
	getSnapshot(): QueryObserver.Result<DataOf<TFactory>>;
	readonly observer: QueryObserver.QueryObserver<TFactory>;
	subscribe(onChange: () => void): () => void;
}

function storeFor<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
	options: UseQueryOptions,
): ObserverStore<TFactory> {
	const observer = QueryObserver.makeUnsafe(query, options);
	return {
		getSnapshot: () => QueryObserver.getUnsafe(observer),
		observer,
		subscribe: (onChange) => QueryObserver.subscribeUnsafe(observer, onChange),
	};
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
 * The promise is stable per data version and already fulfilled once the
 * cache has data, so `use()` only suspends while there is nothing to show.
 * The component re-renders when the promise changes, and when a control it
 * has read changes; changes to controls it never reads are skipped.
 *
 * A handle from `ensure` had its data loaded before the route rendered, so
 * the hook returns the data itself:
 *
 * ```tsx
 * const [post, postState] = useQuery(postQuery, loaderData.post);
 * ```
 *
 * If that entry has lost its data since (garbage-collected, `reset`), the
 * hook suspends until it is refetched.
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
	options: UseQueryOptions = {},
): UseEnsuredQueryResult<TFactory> | UseQueryResult<TFactory> {
	const client = useQueryClient();
	const query = queryFor(client, factory, handle.input);
	assertSent(client, query);
	Query.readUnsafe(query);

	const refetchInterval = options.refetchInterval;
	const refetchOnReconnect = options.refetchOnReconnect;
	const refetchOnWindowFocus = options.refetchOnWindowFocus;
	const whilePending = options.whilePending;
	const [store] = useState(() => storeFor(query, options));
	const observer = store.observer;
	const result = QueryObserver.getOptimisticResultUnsafe(
		observer,
		query,
		options,
	);
	useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	useEffect(() => {
		QueryObserver.setOptionsUnsafe(observer, query, {
			refetchInterval,
			refetchOnReconnect,
			refetchOnWindowFocus,
			whilePending,
		});
	}, [
		observer,
		query,
		refetchInterval,
		refetchOnReconnect,
		refetchOnWindowFocus,
		whilePending,
	]);

	// The promise is returned as the tuple's first element, where reads can't
	// be seen, so it always counts as read.
	QueryObserver.trackProp(observer, "promise");
	const controls = withPromiseCommands(
		QueryObserver.trackResult(observer, result),
	);
	if (handle.ensured === true) {
		const data = use(result.promise);
		// SAFETY: as below; `use` unwraps the promise to its data.
		return [data, controls] as UseEnsuredQueryResult<TFactory>;
	}
	// SAFETY: the result's promise is this factory's entry's promise (or an
	// earlier input's entry of the same factory), and the result has every
	// field of both control shapes.
	return [result.promise, controls] as UseQueryResult<TFactory>;
}
