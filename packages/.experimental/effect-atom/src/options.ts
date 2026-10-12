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

declare const servicesType: unique symbol;

interface ServicesField<TServices> {
	/**
	 * Type-only: the services the `queryFn`'s Effect needs. Never present at
	 * runtime. With `unknown` data any `queryFn` is assignable to
	 * `QueryFnResult`, so its return type can't carry them on its own.
	 */
	readonly [servicesType]?: () => TServices;
}

export interface QueryOptions<TData, TError = unknown, TServices = never>
	extends QueryBehavior, ServicesField<TServices> {
	readonly kind: "query";
	queryFn(
		context: QueryFunctionContext,
	): QueryFnResult<TData, TError, TServices>;
	readonly queryKey: QueryKey;
}

export interface PageFunctionContext<TPageParam> extends QueryFunctionContext {
	/** Which end of the list this page is being added to. */
	readonly direction: "backward" | "forward";
	readonly pageParam: TPageParam;
}

export interface InfiniteQueryOptions<
	TPage,
	TPageParam,
	TError = unknown,
	TServices = never,
>
	extends QueryBehavior, ServicesField<TServices> {
	/** Param for the page after `lastPage`, or `null` / `undefined` at the end. */
	getNextPageParam(
		lastPage: TPage,
		pages: ReadonlyArray<TPage>,
		lastPageParam: TPageParam,
		pageParams: ReadonlyArray<TPageParam>,
	): TPageParam | null | undefined;
	/** Param for the page before `firstPage`, or `null` / `undefined` at the start. */
	getPreviousPageParam?(
		firstPage: TPage,
		pages: ReadonlyArray<TPage>,
		firstPageParam: TPageParam,
		pageParams: ReadonlyArray<TPageParam>,
	): TPageParam | null | undefined;
	readonly initialPageParam: TPageParam;
	readonly kind: "infinite";
	/** Keep at most this many pages; the far end is dropped when paging. */
	readonly maxPages?: number;
	queryFn(
		context: PageFunctionContext<TPageParam>,
	): QueryFnResult<TPage, TError, TServices>;
	readonly queryKey: QueryKey;
}

/** Data of a paged query. */
export interface InfiniteData<TPage, TPageParam = unknown> {
	readonly pageParams: ReadonlyArray<TPageParam>;
	readonly pages: ReadonlyArray<TPage>;
}

export type AnyQueryOptions<TServices = never> =
	| InfiniteQueryOptions<unknown, unknown, unknown, TServices>
	| QueryOptions<unknown, unknown, TServices>;

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

/** Typed options for a paged query factory. */
export function infiniteQueryOptions<
	TPage,
	TPageParam,
	TError = unknown,
	TServices = never,
>(
	options: Omit<
		InfiniteQueryOptions<TPage, TPageParam, TError, TServices>,
		"kind"
	>,
): InfiniteQueryOptions<TPage, TPageParam, TError, TServices> {
	return { ...options, kind: "infinite" };
}

/**
 * A function of zero or one argument returning `queryOptions(...)` or
 * `infiniteQueryOptions(...)` whose `queryFn` needs at most `TServices`. A
 * second parameter is a type error: the single argument is the query's
 * input, and a handle carries it.
 */
export type QueryFactory<TServices = unknown> = (
	input: never,
) => AnyQueryOptions<TServices>;

/** The factory's input type; `undefined` for factories without one. */
export type InputOf<TFactory extends QueryFactory> =
	Parameters<TFactory> extends [] ? undefined : Parameters<TFactory>[0];

/** Arguments after the factory: the input, optional when the factory's is. */
export type InputArgs<TFactory extends QueryFactory> =
	[] extends Parameters<TFactory>
		? [input?: InputOf<TFactory>]
		: [input: InputOf<TFactory>];

/** Whether the factory returns `infiniteQueryOptions(...)`. */
export type IsPaged<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends { readonly kind: "infinite" } ? true : false;

/** `ensure` / `fetch` options. Only paged factories accept `pages`. */
export type LoadOptions<TFactory extends QueryFactory> =
	IsPaged<TFactory> extends true
		? {
				/** Load this many pages up front (default 1). */
				readonly pages?: number;
			}
		: never;

/** `ensure` / `fetch` arguments: the input, then load options for paged factories. */
export type LoadArgs<TFactory extends QueryFactory> =
	| InputArgs<TFactory>
	| [input: InputOf<TFactory>, options: LoadOptions<TFactory>];

/** The data a factory's query resolves to. */
export type DataOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends InfiniteQueryOptions<
		infer TPage,
		infer TPageParam,
		infer _E,
		infer _R
	>
		? InfiniteData<TPage, TPageParam>
		: ReturnType<TFactory> extends QueryOptions<infer TData, infer _E, infer _R>
			? TData
			: never;

/**
 * The error a factory's request fails with: the `queryFn`'s Effect error
 * type, or `unknown` for promises and plain values.
 */
export type ErrorOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends InfiniteQueryOptions<
		infer _P,
		infer _PP,
		infer TError,
		infer _R
	>
		? TError
		: ReturnType<TFactory> extends QueryOptions<
					infer _A,
					infer TError,
					infer _R
			  >
			? TError
			: unknown;

/** The services a factory's `queryFn` Effect needs. */
export type ServicesOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends InfiniteQueryOptions<
		infer _P,
		infer _PP,
		infer _E,
		infer TServices
	>
		? TServices
		: ReturnType<TFactory> extends QueryOptions<
					infer _A,
					infer _E,
					infer TServices
			  >
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
