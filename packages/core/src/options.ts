import type { Effect, Schedule } from "effect";

import type { QueryKey } from "./key.ts";

/** What a `queryFn` may return: a value, a promise, or an `Effect`. */
export type QueryFnResult<TData> =
	| TData
	| PromiseLike<TData>
	| Effect.Effect<TData, unknown>;

export interface QueryFunctionContext {
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

/** Options every query accepts. `QueryClient` defaults fill in the rest. */
export interface QueryBehavior {
	/** How long an unread entry stays cached, in ms. `Infinity` keeps it. */
	readonly gcTime?: number;
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

export interface QueryOptions<TData> extends QueryBehavior {
	readonly kind: "query";
	queryFn(context: QueryFunctionContext): QueryFnResult<TData>;
	readonly queryKey: QueryKey;
}

export interface InfiniteQueryOptions<TPage, TPageParam> extends QueryBehavior {
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
	queryFn(context: PageFunctionContext<TPageParam>): QueryFnResult<TPage>;
	readonly queryKey: QueryKey;
}

/** Data of a paged query. */
export interface InfiniteData<TPage, TPageParam = unknown> {
	readonly pageParams: ReadonlyArray<TPageParam>;
	readonly pages: ReadonlyArray<TPage>;
}

export type AnyQueryOptions =
	| QueryOptions<unknown>
	| InfiniteQueryOptions<unknown, unknown>;

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
 */
export function queryOptions<TData>(
	options: Omit<QueryOptions<TData>, "kind">,
): QueryOptions<TData> {
	return { ...options, kind: "query" };
}

/** Typed options for a paged query factory. */
export function infiniteQueryOptions<TPage, TPageParam>(
	options: Omit<InfiniteQueryOptions<TPage, TPageParam>, "kind">,
): InfiniteQueryOptions<TPage, TPageParam> {
	return { ...options, kind: "infinite" };
}

/**
 * A function of zero or one argument returning `queryOptions(...)` or
 * `infiniteQueryOptions(...)`. A second parameter is a type error: the single
 * argument is the query's input, and a handle carries it.
 */
export type QueryFactory = (input: never) => AnyQueryOptions;

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
		infer TPageParam
	>
		? InfiniteData<TPage, TPageParam>
		: ReturnType<TFactory> extends QueryOptions<infer TData>
			? TData
			: never;

/** Page type of a paged factory. */
export type PageOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends InfiniteQueryOptions<infer TPage, unknown>
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

/**
 * The serializable reference a loader or server component hands to the
 * component that reads the query. It holds no data and no functions.
 */
export interface QueryHandle<TFactory extends QueryFactory = QueryFactory> {
	/** Type-only: ties the handle to its factory. Never present at runtime. */
	readonly [factoryType]?: TFactory;
	/** The factory's input; `unknown` on a handle of no particular factory. */
	readonly input: QueryFactory extends TFactory ? unknown : InputOf<TFactory>;
	readonly key: QueryKey;
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
