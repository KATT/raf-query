import type {
	QueryBehavior,
	QueryFunctionContext,
	QueryKey,
} from "@raf-query/core";
import type { Effect } from "effect";

/**
 * What a `queryFn` may return: a value, a promise, or an `Effect`. An
 * Effect's error type becomes the query's, and the services it needs become
 * requirements of the verbs that start it.
 */
export type QueryFnResult<TData, TError = never, TServices = never> =
	| TData
	| PromiseLike<TData>
	| Effect.Effect<TData, TError, TServices>;

export interface QueryOptions<
	TData,
	TError = unknown,
	TServices = never,
> extends QueryBehavior {
	readonly kind: "query";
	queryFn(
		context: QueryFunctionContext,
	): QueryFnResult<TData, TError, TServices>;
	readonly queryKey: QueryKey;
}

/**
 * Typed options for a query factory. The `queryFn` can be an Effect that
 * needs services:
 *
 * ```ts
 * export function issueQuery(input: { id: number }) {
 *   return queryOptions({
 *     queryKey: ["issue", input.id],
 *     queryFn: () =>
 *       Effect.gen(function* () {
 *         const api = yield* IssueApi;
 *         return yield* api.get(input.id);
 *       }),
 *   });
 * }
 * ```
 */
export function queryOptions<TData, TError = unknown, TServices = never>(
	options: Omit<QueryOptions<TData, TError, TServices>, "kind">,
): QueryOptions<TData, TError, TServices> {
	return { ...options, kind: "query" };
}

/**
 * A function of zero or one argument returning `queryOptions(...)` whose
 * `queryFn` needs at most `TServices`. A second parameter is a type error:
 * the single argument is the query's input, and a handle carries it.
 */
export type QueryFactory<TServices = unknown> = (
	input: never,
) => QueryOptions<unknown, unknown, TServices>;

/** The factory's input type; `undefined` for factories without one. */
export type InputOf<TFactory extends QueryFactory> =
	Parameters<TFactory> extends [] ? undefined : Parameters<TFactory>[0];

/** Arguments after the factory: the input, optional when the factory's is. */
export type InputArgs<TFactory extends QueryFactory> =
	[] extends Parameters<TFactory>
		? [input?: InputOf<TFactory>]
		: [input: InputOf<TFactory>];

/** The data a factory's query resolves to. */
export type DataOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends QueryOptions<infer TData, infer _E, infer _R>
		? TData
		: never;

/**
 * The error a factory's request fails with: the `queryFn`'s Effect error
 * type, or `unknown` for promises and plain values.
 */
export type ErrorOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends QueryOptions<infer _A, infer TError, infer _R>
		? TError
		: unknown;

/** The services a factory's `queryFn` Effect needs. */
export type ServicesOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends QueryOptions<infer _A, infer _E, infer TServices>
		? TServices
		: never;

declare const factoryType: unique symbol;

interface HandleFields<TFactory extends QueryFactory> {
	/** Type-only: ties the handle to its factory. Never present at runtime. */
	readonly [factoryType]?: TFactory;
	/** The factory's input; `unknown` on a handle of no particular factory. */
	readonly input: QueryFactory extends TFactory ? unknown : InputOf<TFactory>;
	readonly key: QueryKey;
}

/**
 * The serializable reference a loader hands to the component that reads the
 * query. It holds no data and no functions.
 */
export interface QueryHandle<
	TFactory extends QueryFactory = QueryFactory,
> extends HandleFields<TFactory> {
	readonly ensured?: false;
}

/**
 * A handle from `ensure`: its data was loaded before the handle was
 * returned, so `useQuery` returns the data rather than a promise.
 */
export interface EnsuredQueryHandle<
	TFactory extends QueryFactory = QueryFactory,
> extends HandleFields<TFactory> {
	readonly ensured: true;
}
