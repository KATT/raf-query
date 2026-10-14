"use client";

import {
	type DataOf,
	type EnsuredQueryHandle,
	type ErrorOf,
	fulfilled,
	type InputArgs,
	type InputOf,
	type IsPaged,
	pending,
	type QueryFactory,
	type QueryHandle,
	type QueryKey,
	QueryObserver,
	type Thenable,
	Query,
} from "@raf-query/core";
import { Effect, Result } from "effect";
import { use, useEffect, useState, useSyncExternalStore } from "react";

import { assertSent } from "./browser-requests.ts";
import { unsafeCast } from "./cast.ts";
import type { QueryClient } from "./client.ts";
import { useQueryClient } from "./provider.tsx";

/** `refetchInterval`, `refetchOnWindowFocus`, `refetchOnReconnect`, `whilePending`. */
export type UseQueryOptions = QueryObserver.Options;

/**
 * `throwOnError` only when {@link ErrorOf} is typed (Effect `queryFn`).
 * Promise factories always throw; the option is not part of their options.
 */
export type UseQueryThrowOptions<TFactory extends QueryFactory> =
	HasTypedError<TFactory> extends true
		? {
				/**
				 * When `false`, the first tuple slot is a `Result` instead of a
				 * rejecting promise. Omit to use the client's default (`false`
				 * with a `layer`, `true` without).
				 */
				readonly throwOnError?: boolean;
			}
		: { readonly throwOnError?: never };

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

/**
 * `true` when the factory's error channel is typed (Effect `queryFn`), not
 * `unknown` (promise / plain value).
 */
export type HasTypedError<TFactory extends QueryFactory> =
	unknown extends ErrorOf<TFactory> ? false : true;

/**
 * Whether this read throws on failure. Untyped errors always throw. Typed
 * errors follow `options.throwOnError`, else the client's default (`false`
 * with a `layer`, `true` without). Types treat an omitted flag as `false`
 * (Result), matching a client with a `layer`.
 */
export type ThrowsOnError<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined,
> =
	HasTypedError<TFactory> extends false
		? true
		: TThrow extends boolean
			? TThrow
			: false;

export type UseQueryResult<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> =
	ThrowsOnError<TFactory, TThrow> extends true
		? readonly [
				promise: Thenable<DataOf<TFactory>>,
				controls: UseQueryControls<TFactory>,
			]
		: readonly [
				promise: Thenable<Result.Result<DataOf<TFactory>, ErrorOf<TFactory>>>,
				controls: UseQueryControls<TFactory>,
			];

/** {@link useQuery}'s result for a handle from `ensure`. */
export type UseEnsuredQueryResult<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> =
	ThrowsOnError<TFactory, TThrow> extends true
		? readonly [data: DataOf<TFactory>, controls: UseQueryControls<TFactory>]
		: readonly [
				result: Result.Result<DataOf<TFactory>, ErrorOf<TFactory>>,
				controls: UseQueryControls<TFactory>,
			];

export function queryFor<TFactory extends QueryFactory>(
	client: QueryClient<unknown>,
	factory: TFactory,
	input: unknown,
): Query.Query<TFactory> {
	// SAFETY: `input` is a handle's input, and handles are typed to the
	// factory they were created through (`QueryHandle<TFactory>`).
	// oxlint-disable-next-line typescript/consistent-type-assertions
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
	// SAFETY: the trap below replaces exactly the `Command` properties with
	// Promise functions and forwards every other read.
	return unsafeCast<PromiseCommands>(
		new Proxy(tracked, {
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
		}),
	);
}

/** An observer, with the stable callbacks `useSyncExternalStore` needs. */
interface ObserverStore<TFactory extends QueryFactory> {
	getSnapshot(): QueryObserver.Result<DataOf<TFactory>>;
	readonly observer: QueryObserver.QueryObserver<TFactory>;
	subscribe(onChange: () => void): () => void;
}

function storeFor<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
	options: QueryObserver.Options,
): ObserverStore<TFactory> {
	const observer = QueryObserver.makeUnsafe(query, options);
	return {
		getSnapshot: () => QueryObserver.getUnsafe(observer),
		observer,
		subscribe: (onChange) => QueryObserver.subscribeUnsafe(observer, onChange),
	};
}

/**
 * One `Result` thenable per data thenable, so `use()` sees a stable identity
 * across re-renders the same way it does for the data promise.
 */
const resultThenables = new WeakMap<
	Thenable<unknown>,
	Thenable<Result.Result<unknown, unknown>>
>();

function asResultThenable<A, E>(
	promise: Thenable<A>,
): Thenable<Result.Result<A, E>> {
	const cached = resultThenables.get(promise);
	if (cached) {
		return unsafeCast<Thenable<Result.Result<A, E>>>(cached);
	}
	let next: Thenable<Result.Result<A, E>>;
	if (promise.status === "fulfilled") {
		next = fulfilled(Result.succeed(promise.value));
	} else if (promise.status === "rejected") {
		next = fulfilled(Result.fail(unsafeCast<E>(promise.reason)));
	} else {
		const deferred = pending<Result.Result<A, E>>();
		promise.then(
			(value) => {
				deferred.resolve(Result.succeed(value));
			},
			(error: unknown) => {
				deferred.resolve(Result.fail(unsafeCast<E>(error)));
			},
		);
		next = deferred.promise;
	}
	resultThenables.set(
		promise,
		unsafeCast<Thenable<Result.Result<unknown, unknown>>>(next),
	);
	return next;
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
 * For an Effect `queryFn` (typed {@link ErrorOf}), with the client's
 * `throwOnError: false` (the default when it has a `layer`), the first slot
 * is a `Result` instead — `use()` never throws:
 *
 * ```tsx
 * const [issueResult, issueState] = useQuery(issueQuery, loaderData.issue);
 * const issue = use(issueResult);
 * Result.match(issue, { onFailure: …, onSuccess: … });
 * ```
 *
 * The promise is stable per data version and already fulfilled once the
 * cache has data, so `use()` only suspends while there is nothing to show.
 * The component re-renders when the promise changes, and when a control it
 * has read changes; changes to controls it never reads are skipped.
 *
 * A handle from `ensure` had its data loaded before the route rendered, so
 * the hook returns the data (or `Result`) itself:
 *
 * ```tsx
 * const [post, postState] = useQuery(postQuery, loaderData.post);
 * ```
 *
 * If that entry has lost its data since (garbage-collected, `reset`), the
 * hook suspends until it is refetched.
 */
export function useQuery<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handle: EnsuredQueryHandle<TFactory>,
	options?: UseQueryOptions &
		UseQueryThrowOptions<TFactory> & { readonly throwOnError?: TThrow },
): UseEnsuredQueryResult<TFactory, TThrow>;
export function useQuery<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	options?: UseQueryOptions &
		UseQueryThrowOptions<TFactory> & { readonly throwOnError?: TThrow },
): UseQueryResult<TFactory, TThrow>;
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: EnsuredQueryHandle<TFactory> | QueryHandle<TFactory>,
	options: UseQueryOptions & { readonly throwOnError?: boolean } = {},
	// Overloads name the return; the body picks at runtime.
):
	| UseEnsuredQueryResult<TFactory, boolean>
	| UseQueryResult<TFactory, boolean> {
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
	const throwOnError = options.throwOnError ?? client.throwOnError;
	if (!throwOnError) {
		const resultPromise = asResultThenable<DataOf<TFactory>, ErrorOf<TFactory>>(
			result.promise,
		);
		if (handle.ensured === true) {
			return unsafeCast<UseEnsuredQueryResult<TFactory, false>>([
				use(resultPromise),
				controls,
			]);
		}
		return unsafeCast<UseQueryResult<TFactory, false>>([
			resultPromise,
			controls,
		]);
	}
	if (handle.ensured === true) {
		// SAFETY: as below; `use` unwraps the promise to its data.
		return unsafeCast<UseEnsuredQueryResult<TFactory, true>>([
			use(result.promise),
			controls,
		]);
	}
	// SAFETY: the result's promise is this factory's entry's promise (or an
	// earlier input's entry of the same factory), and the result has every
	// field of both control shapes.
	return unsafeCast<UseQueryResult<TFactory, true>>([result.promise, controls]);
}
