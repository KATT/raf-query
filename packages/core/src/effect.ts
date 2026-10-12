/**
 * Effect entry points (`@raf-query/core/effect`). Nothing else in the
 * library imports this module, so apps that don't use it don't bundle the
 * Effect runtime.
 */
import { Cause, Duration, Effect, Exit, Queue, Schedule, Stream } from "effect";

import {
	cacheOf,
	type LoadArgs,
	type QueryClient,
	type QueryFilter,
} from "./client.ts";
import {
	type DataOf,
	type EnsuredQueryHandle,
	type InfiniteQueryOptions,
	infiniteQueryOptions as plainInfiniteQueryOptions,
	type InputArgs,
	type PageFunctionContext,
	type QueryFactory,
	type QueryFnResult,
	type QueryFunctionContext,
	type QueryOptions,
	queryOptions as plainQueryOptions,
	type RetryPolicy,
	type RetryStrategy,
} from "./options.ts";
import { CancelledError, type QueryState } from "./query.ts";

/** A value, a promise, or an `Effect`. */
export type EffectFnResult<TData> =
	| QueryFnResult<TData>
	| Effect.Effect<TData, unknown>;

/** A {@link RetryPolicy}, or a `Schedule` fed with each failure. */
export type EffectRetryPolicy =
	| RetryPolicy
	| Schedule.Schedule<unknown, unknown>;

export interface EffectQueryOptions<TData> extends Omit<
	QueryOptions<TData>,
	"kind" | "queryFn" | "retry"
> {
	queryFn(context: QueryFunctionContext): EffectFnResult<TData>;
	readonly retry?: EffectRetryPolicy;
}

export interface EffectInfiniteQueryOptions<TPage, TPageParam> extends Omit<
	InfiniteQueryOptions<TPage, TPageParam>,
	"kind" | "queryFn" | "retry"
> {
	queryFn(context: PageFunctionContext<TPageParam>): EffectFnResult<TPage>;
	readonly retry?: EffectRetryPolicy;
}

const identity = <T>(value: T) => value;

function isEffectResult<T>(
	result: EffectFnResult<T>,
): result is Effect.Effect<T, unknown> {
	return Effect.isEffect(result);
}

/** Runs an Effect result until `signal` aborts, which interrupts it. */
function run<T>(result: EffectFnResult<T>, signal: AbortSignal) {
	if (!isEffectResult(result)) {
		return result;
	}
	return Effect.runPromiseExit(result, { signal }).then((exit) => {
		if (Exit.isSuccess(exit)) {
			return exit.value;
		}
		throw Cause.hasInterruptsOnly(exit.cause)
			? new CancelledError()
			: Cause.squash(exit.cause);
	});
}

function retryPolicy(
	policy: EffectRetryPolicy | undefined,
): RetryPolicy | undefined {
	return Schedule.isSchedule(policy) ? retrySchedule(policy) : policy;
}

/**
 * A retry policy driven by a `Schedule`, for `config.defaults` or plain
 * `queryOptions`. Each request steps a fresh copy with every failure; the
 * schedule's delay is the wait before the next attempt.
 */
export function retrySchedule(
	schedule: Schedule.Schedule<unknown, unknown>,
): RetryStrategy {
	return {
		start() {
			const step = Effect.runSync(Schedule.toStep(schedule));
			return (_failureCount, error) => {
				const exit = Effect.runSyncExit(step(Date.now(), error));
				return Exit.isSuccess(exit) ? Duration.toMillis(exit.value[1]) : false;
			};
		},
	};
}

/**
 * `queryOptions` whose `queryFn` may return an `Effect` (interrupted when the
 * request is cancelled) and whose `retry` may be a `Schedule`.
 */
export function effectQueryOptions<TData>(
	options: EffectQueryOptions<TData>,
): QueryOptions<TData> {
	const { queryFn, retry: policy, ...rest } = options;
	return plainQueryOptions<TData>({
		...rest,
		queryFn: (context) => run(queryFn(context), context.signal),
		retry: retryPolicy(policy),
	});
}

/** `infiniteQueryOptions` with an Effect `queryFn` and `Schedule` retries. */
export function effectInfiniteQueryOptions<TPage, TPageParam>(
	options: EffectInfiniteQueryOptions<TPage, TPageParam>,
): InfiniteQueryOptions<TPage, TPageParam> {
	const { queryFn, retry: policy, ...rest } = options;
	return plainInfiniteQueryOptions<TPage, TPageParam>({
		...rest,
		queryFn: (context) => run(queryFn(context), context.signal),
		retry: retryPolicy(policy),
	});
}

/** `client.ensure` as an Effect. */
export function ensureEffect<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: LoadArgs<TFactory>
): Effect.Effect<EnsuredQueryHandle<TFactory>, unknown> {
	return Effect.tryPromise({
		catch: identity,
		try: () => client.ensure(factory, ...args),
	});
}

/** `client.fetch` as an Effect: fails with the request's error. */
export function fetchEffect<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: LoadArgs<TFactory>
): Effect.Effect<DataOf<TFactory>, unknown> {
	return Effect.tryPromise({
		catch: identity,
		try: () => client.fetch(factory, ...args),
	});
}

/** `client.invalidate` as an Effect. */
export function invalidateEffect<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: InputArgs<TFactory>
): Effect.Effect<void>;
export function invalidateEffect(
	client: QueryClient,
	filter: QueryFilter,
): Effect.Effect<void>;
export function invalidateEffect(
	client: QueryClient,
	target: QueryFactory | QueryFilter,
	input?: unknown,
): Effect.Effect<void> {
	return Effect.promise(() => cacheOf(client).invalidate(target, input));
}

/**
 * The entry's current state, then every change. Counts as a reader while
 * the stream runs, so invalidation and focus refetch it.
 */
export function watch<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: InputArgs<TFactory>
): Stream.Stream<QueryState<DataOf<TFactory>>> {
	return Stream.callback((queue) => {
		const query = client.getQuery(factory, ...args);
		return Effect.acquireRelease(
			Effect.sync(() => {
				Queue.offerUnsafe(queue, query.getState());
				return query.subscribe(() =>
					Queue.offerUnsafe(queue, query.getState()),
				);
			}),
			(unsubscribe) => Effect.sync(unsubscribe),
		);
	});
}
