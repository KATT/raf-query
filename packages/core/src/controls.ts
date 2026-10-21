/**
 * What a framework binding's `useQuery` returns next to the data: the
 * observer's result with Promise commands, and the types every binding
 * shares. The React, Svelte and Vue packages build their reads on this.
 */
import { Cause, Effect, Exit, Result } from "effect";

import { causeOf } from "./entry.ts";
import type { QueryKey } from "./key.ts";
import type * as QueryObserver from "./observer.ts";
import * as Query from "./query.ts";
import type {
	DataOf,
	ErrorOf,
	InputOf,
	IsPaged,
	QueryFactory,
	ThrowOnErrorOf,
} from "./options.ts";
import { fulfilled, pending, type Thenable } from "./thenable.ts";

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
				 * When `false`, the data is a `Result` instead of a rejecting
				 * promise. Omit to use the query's `throwOnError`, else the
				 * client's default (`false` with a `layer`, `true` without).
				 */
				readonly throwOnError?: boolean;
			}
		: { readonly throwOnError?: never };

/** What `useQuery` returns next to the data. */
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
 * errors follow the read's `throwOnError`, else the query's
 * ({@link ThrowOnErrorOf}), else the client's default (`false` with a
 * `layer`, `true` without). Types can't see the client's, so they treat it
 * as `false` (Result), matching a client with a `layer`.
 */
export type ThrowsOnError<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined,
> =
	HasTypedError<TFactory> extends false
		? true
		: TThrow extends boolean
			? TThrow
			: ThrowOnErrorOf<TFactory> extends boolean
				? ThrowOnErrorOf<TFactory>
				: false;

/**
 * {@link ThrowsOnError} at runtime, for bindings: a read of `query` throws
 * when its `queryFn` returns a promise or plain value, whose error isn't
 * typed. Otherwise it follows the read's `throwOnError`, else the query's
 * options', else `clientDefault` (pass the client's `throwOnError`). A query
 * whose `queryFn` hasn't run yet follows the flags.
 */
export function throwsOnError<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
	throwOnError: boolean | undefined,
	clientDefault = false,
): boolean {
	return (
		Query.returnsEffectUnsafe(query) === false ||
		(throwOnError ?? query.options?.throwOnError ?? clientDefault)
	);
}

/** What a read settles with: the data, or a `Result` when it doesn't throw. */
export type ReadValue<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> =
	ThrowsOnError<TFactory, TThrow> extends true
		? DataOf<TFactory>
		: Result.Result<DataOf<TFactory>, ErrorOf<TFactory>>;

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

/** An observer result whose command Effects are Promise functions. */
export type PromiseControls = Omit<QueryObserver.Result, Command> &
	Record<Command, () => Promise<void>>;

/**
 * `result`, with the observer's command Effects as Promise functions. Reads
 * of every other property go through to `result`, so a tracked result
 * (`QueryObserver.trackResult`) stays tracked. For bindings.
 */
export function promiseControls(result: QueryObserver.Result): PromiseControls {
	const proxied = new Proxy(result, {
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
	return proxied as unknown as PromiseControls;
}

/**
 * A thenable that fulfills with `onSettle`'s value when `promise` settles,
 * never rejecting. Settled already when `promise` is, and the same thenable
 * for the same `promise` in the same `cache`, so readers see a stable
 * identity across re-renders the way they do for the data promise.
 */
function settledThenable<A, B>(
	cache: WeakMap<Thenable<unknown>, Thenable<unknown>>,
	promise: Thenable<A>,
	onSettle: (
		settled:
			| { readonly status: "fulfilled"; readonly value: A }
			| { readonly reason: unknown; readonly status: "rejected" },
	) => B,
): Thenable<B> {
	const cached = cache.get(promise);
	if (cached) {
		// SAFETY: each cache holds one `onSettle`'s thenables, keyed by the
		// promise whose value it maps; A and B are erased in the map.
		return cached as Thenable<B>;
	}
	let next: Thenable<B>;
	if (promise.status === "pending") {
		const deferred = pending<B>();
		promise.then(
			(value) => {
				deferred.resolve(onSettle({ status: "fulfilled", value }));
			},
			(error: unknown) => {
				deferred.resolve(onSettle({ reason: error, status: "rejected" }));
			},
		);
		next = deferred.promise;
	} else {
		next = fulfilled(onSettle(promise));
	}
	cache.set(promise, next);
	return next;
}

const resultThenables = new WeakMap<Thenable<unknown>, Thenable<unknown>>();

/**
 * A thenable that fulfills with a `Result` when `promise` settles, for reads
 * that don't throw (`throwOnError: false`). Settled already when `promise`
 * is, and the same thenable for the same `promise`. For bindings.
 */
export function resultThenable<A, E>(
	promise: Thenable<A>,
): Thenable<Result.Result<A, E>> {
	return settledThenable(resultThenables, promise, (settled) =>
		settled.status === "fulfilled"
			? Result.succeed(settled.value)
			: Result.fail(
					// SAFETY: rejected reasons are this factory's ErrorOf when Result
					// mode is on (typed Effect queryFn).
					settled.reason as E,
				),
	);
}

const exitThenables = new WeakMap<Thenable<unknown>, Thenable<unknown>>();

/**
 * A thenable that fulfills with the read's `Exit` when `promise` (a query's
 * `State.promise`) settles: its data, or the whole `Cause` its first load
 * failed with, so a typed failure stays apart from a defect. A rejection
 * the cache has no `Cause` for, such as a request adopted from a server's
 * dehydrated state, is a defect. Never rejects; settled already when
 * `promise` is, and the same thenable for the same `promise`. For bindings.
 */
export function exitThenable<A, E>(
	promise: Thenable<A>,
): Thenable<Exit.Exit<A, E>> {
	return settledThenable(exitThenables, promise, (settled) =>
		settled.status === "fulfilled"
			? Exit.succeed(settled.value)
			: Exit.failCause(
					// SAFETY: a first load's failures are its factory's ErrorOf; the
					// rest of a Cause (defects, interrupts) has no error type.
					(causeOf(promise) ?? Cause.die(settled.reason)) as Cause.Cause<E>,
				),
	);
}
