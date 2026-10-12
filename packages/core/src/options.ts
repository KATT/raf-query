import type { Effect, Schedule } from "effect";

import type { QueryKey } from "./key.ts";

/**
 * What a `queryFn` may return: a value, a promise, or an `Effect`. An
 * Effect's error type becomes the query's (promises reject with `unknown`),
 * and the services it needs become requirements of the verbs that start it.
 */
export type QueryFnResult<TData, TError = unknown, TServices = never> =
	| TData
	| PromiseLike<TData>
	| Effect.Effect<TData, TError, TServices>;

/**
 * App-wide types, filled in by module augmentation. Declare `queryMeta` to
 * type every query's `meta`. Augment the package you import from;
 * `@raf-query/react` re-exports this interface, so either works:
 *
 * ```ts
 * declare module "@raf-query/react" {
 *   interface Register {
 *     queryMeta: { errorMessage?: string };
 *   }
 * }
 * ```
 */
// oxlint-disable-next-line typescript/no-empty-object-type -- apps add members by declaration merging
export interface Register {}

/**
 * Type of a query's `meta`. `Record<string, unknown>` unless `queryMeta` is
 * declared on {@link Register}.
 */
export type QueryMeta = Register extends { queryMeta: infer TQueryMeta }
	? TQueryMeta
	: Record<string, unknown>;

export interface QueryFunctionContext {
	/** The query's `meta` when this request started ({@link QueryBehavior.meta}). */
	readonly meta: QueryMeta | undefined;
	/** The query's key, as returned by the factory. */
	readonly queryKey: QueryKey;
	/** Aborted when the request is cancelled or superseded. */
	readonly signal: AbortSignal;
}

export interface PageFunctionContext<TPageParam> extends QueryFunctionContext {
	/** Which end of the list this page is being added to. */
	readonly direction: "backward" | "forward";
	readonly pageParam: TPageParam;
}

/**
 * How many times to retry a failed request: `false`, `true` (forever), a
 * count, a predicate, or an Effect `Schedule`. The predicate gets the number
 * of failures so far (1 after the first).
 */
export type RetryPolicy =
	| boolean
	| number
	| Schedule.Schedule<unknown, unknown>
	| ((failureCount: number, error: unknown) => boolean);

/** Options every query accepts. `QueryCache` defaults fill in the rest. */
export interface QueryBehavior {
	/** How long an unread entry stays cached, in ms. `Infinity` keeps it. */
	readonly gcTime?: number;
	/**
	 * Anything to know about the query elsewhere: the `queryFn` context,
	 * `Query.metaUnsafe(query)` (e.g. in the client's `onError`), devtools. A
	 * query's own `meta` replaces the default's as a whole.
	 */
	readonly meta?: QueryMeta;
	/** Refetch read, stale queries when the browser comes back online. */
	readonly refetchOnReconnect?: boolean;
	/** Refetch read, stale queries when the window regains focus. */
	readonly refetchOnWindowFocus?: boolean;
	/** Retries after a failed request. */
	readonly retry?: RetryPolicy;
	/** Delay before retry number `failureCount` (1-based), in ms. */
	readonly retryDelay?:
		| number
		| ((failureCount: number, error: unknown) => number);
	/** How long data counts as fresh, in ms. Fresh data is never refetched. */
	readonly staleTime?: number;
	/**
	 * Keep the parts of new data that are deeply equal to the old data, so
	 * unchanged objects keep their identity and unchanged data keeps its
	 * promise. Compares plain objects and arrays. Default `true`.
	 */
	readonly structuralSharing?: boolean;
}

declare const servicesType: unique symbol;

interface ServicesField<TServices> {
	/**
	 * Type-only: the services the `queryFn`'s Effect needs. Never present at
	 * runtime. A `queryFn`'s return type can't carry them on its own: with
	 * `unknown` data, any return type is assignable to `QueryFnResult`.
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

export type AnyQueryOptions =
	| QueryOptions<unknown, unknown, unknown>
	| InfiniteQueryOptions<unknown, unknown, unknown, unknown>;

/**
 * Typed options for a query factory:
 *
 * ```ts
 * export function postQuery(input: { slug: string }) {
 *   return queryOptions({
 *     queryKey: ["post", input.slug],
 *     queryFn: () => getPost(input),
 *   });
 * }
 * ```
 *
 * A `queryFn` Effect may need services; they're inferred, and every verb
 * that can start the query requires them.
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

interface FactoryResult {
	readonly kind: "infinite" | "query";
	readonly queryKey: QueryKey;
}

/**
 * A function of zero or one argument returning `queryOptions(...)` or
 * `infiniteQueryOptions(...)` whose `queryFn` needs at most `TServices`
 * (any services by default). A second parameter is a type error: the single
 * argument is the query's input, and a handle carries it.
 *
 * The return type names no `queryFn`, and no services for the default:
 * TypeScript infers an inline factory's `queryOptions` type arguments from
 * it, and an `unknown` there would infer `unknown` services.
 */
export type QueryFactory<TServices = unknown> = (
	input: never,
) => unknown extends TServices
	? FactoryResult
	: FactoryResult & ServicesField<TServices>;

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

/** The data a factory's query resolves to. */
export type DataOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends InfiniteQueryOptions<
		infer TPage,
		infer TPageParam,
		infer _TError,
		infer _TServices
	>
		? InfiniteData<TPage, TPageParam>
		: ReturnType<TFactory> extends QueryOptions<
					infer TData,
					infer _TError,
					infer _TServices
			  >
			? TData
			: never;

/**
 * The error a factory's request fails with: the `queryFn`'s Effect error
 * type, or `unknown` for promises and plain values.
 */
export type ErrorOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends InfiniteQueryOptions<
		infer _TPage,
		infer _TPageParam,
		infer TError,
		infer _TServices
	>
		? TError
		: ReturnType<TFactory> extends QueryOptions<
					infer _TData,
					infer TError,
					infer _TServices
			  >
			? TError
			: unknown;

/**
 * The services a factory's `queryFn` Effect needs: what `ensure`, `fetch`,
 * `prefetch`, `getQuery` and `watch` require. `never` for promises and plain
 * values, and for a factory of no particular query.
 */
export type ServicesOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends InfiniteQueryOptions<
		infer _TPage,
		infer _TPageParam,
		infer _TError,
		infer TServices
	>
		? TServices
		: ReturnType<TFactory> extends QueryOptions<
					infer _TData,
					infer _TError,
					infer TServices
			  >
			? TServices
			: never;

/** Page type of a paged factory. */
export type PageOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends InfiniteQueryOptions<
		infer TPage,
		unknown,
		infer _TError,
		infer _TServices
	>
		? TPage
		: never;

/** `ensure` / `fetch` options. Only paged factories accept `pages`. */
export type LoadOptions<TFactory extends QueryFactory> =
	IsPaged<TFactory> extends true
		? {
				/** Load this many pages up front (default 1). */
				readonly pages?: number;
			}
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
 * The serializable reference a loader or server component hands to the
 * component that reads the query. It holds no data and no functions.
 */
export interface QueryHandle<
	TFactory extends QueryFactory = QueryFactory,
> extends HandleFields<TFactory> {
	readonly ensured?: false;
}

/**
 * A handle from `ensure`: its data was loaded before the handle was
 * returned, so `useQuery` returns the data rather than a promise. Not
 * assignable to {@link QueryHandle}, so a prop typed for one can't receive
 * the other.
 */
export interface EnsuredQueryHandle<
	TFactory extends QueryFactory = QueryFactory,
> extends HandleFields<TFactory> {
	readonly ensured: true;
}

/**
 * Calls a factory with an input the caller has already type-checked against
 * `InputArgs<TFactory>`.
 */
export function optionsFor(
	factory: QueryFactory,
	input: unknown,
): AnyQueryOptions {
	// SAFETY: every caller passes the factory's own input (typed through
	// `InputArgs<TFactory>`); `QueryFactory` erases it to `never` only so that
	// any one-argument factory is assignable.
	// oxlint-disable-next-line typescript/consistent-type-assertions
	const call = factory as (input: unknown) => AnyQueryOptions;
	return call(input);
}
