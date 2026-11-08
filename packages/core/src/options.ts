import type { Fail } from "./fail.ts";
import type { AnyFactory, QueryKey } from "./keys.ts";
import type { AnyRoot, DefaultTypes, Def, RootTypes } from "./root.ts";

export interface QueryFunctionContext<TKey extends QueryKey = QueryKey> {
	/** The query's `meta`, typed by its root where the query is defined. */
	readonly meta: object;
	readonly queryKey: TKey;
	/** Aborted when the request is restarted or its entry is removed. */
	readonly signal: AbortSignal;
}

declare const dataTag: unique symbol;
declare const failTag: unique symbol;

/** Options every query takes. */
export interface BaseOptions<
	TKey extends QueryKey,
	TTypes extends RootTypes = RootTypes,
> {
	/** The root this factory belongs to: `defType<typeof makeQueryClient>()`. */
	readonly def?: Def<TTypes>;
	/** `false`: the query doesn't run. Default `true`. */
	readonly enabled?: boolean;
	/** How long an entry with no reader stays cached. Default 5 minutes; never on the server. */
	readonly gcTime?: number;
	/**
	 * Settings for the root's links and features, and data for targets: the
	 * fields the root's parts declare, such as `retry` with the `retry()`
	 * link.
	 */
	readonly meta?: NoInfer<Partial<TTypes["meta"]>>;
	/** A plain array, usually built by a `group()`. Handles keep its literal type. */
	readonly queryKey: TKey;
	/** How long data stays fresh, in ms. Default `0`. */
	readonly staleTime?: number;
	/** Keep the deeply equal parts of new data, so they keep their identity. Default `true`. */
	readonly structuralSharing?: boolean;
}

/** What `queryOptions` and `infiniteQueryOptions` return. */
export interface QueryOptions<
	TKey extends QueryKey = QueryKey,
	TQueryFnData = unknown,
	TFail = unknown,
	TData = TQueryFnData,
	TTypes extends RootTypes = RootTypes,
> extends BaseOptions<TKey, TTypes> {
	/** Set by `infiniteQueryOptions`: runs the request page by page. */
	readonly "~run"?: (op: never) => Promise<unknown>;
	readonly [dataTag]?: TData;
	readonly [failTag]?: TFail;
	readonly queryFn: (context: never) => unknown;
	readonly select?: (data: TQueryFnData) => TData;
	readonly stream?: StreamOptions<TQueryFnData, never>;
}

export interface StreamOptions<TData, TChunk> {
	/** The data before the first chunk. */
	readonly initial: TData;
	/** Fold a chunk into the data. */
	readonly reduce: (data: TData, chunk: TChunk) => TData;
}

type Awaitable<T> = PromiseLike<T> | T;

/**
 * Typed options for a query factory:
 *
 * ```ts
 * export const issueQuery = (input: { id: number }) =>
 *   queryOptions({
 *     queryKey: issues("byId", input),
 *     queryFn: ({ signal }) => getIssue(input.id, { signal }),
 *   });
 * ```
 *
 * A `queryFn` that returns an async iterable is a stream: pass `stream` to
 * fold its chunks into the data. Readers get the data after the first chunk,
 * and every later chunk updates it in place.
 */
export function queryOptions<
	const TKey extends QueryKey,
	TChunk,
	TData,
	TTypes extends RootTypes = DefaultTypes,
>(
	options: BaseOptions<TKey, TTypes> & {
		readonly queryFn: (
			context: QueryFunctionContext<TKey>,
		) => AsyncIterable<TChunk>;
		readonly stream: StreamOptions<TData, TChunk>;
	},
): QueryOptions<TKey, TData, never, TData, TTypes>;
export function queryOptions<
	const TKey extends QueryKey,
	TResult,
	TData = Exclude<TResult, Fail>,
	TTypes extends RootTypes = DefaultTypes,
>(
	options: BaseOptions<TKey, TTypes> & {
		readonly queryFn: (
			context: QueryFunctionContext<TKey>,
		) => Awaitable<TResult>;
		readonly select?: (data: Exclude<TResult, Fail>) => TData;
	},
): QueryOptions<
	TKey,
	Exclude<TResult, Fail>,
	Extract<TResult, Fail>,
	TData,
	TTypes
>;
export function queryOptions(options: QueryOptions): QueryOptions {
	return options;
}

/**
 * A function of the query's input that returns its options. The input is a
 * method parameter typed `unknown`, which TypeScript checks bivariantly:
 * every factory fits, and an inline generic factory maker passed where a
 * `QueryFactory` is expected infers its own type parameters instead of
 * `never`.
 */
export type QueryFactory = {
	factory(input: unknown): {
		readonly queryFn: (context: never) => unknown;
		readonly queryKey: QueryKey;
	};
}["factory"];

/** A factory whose query has one value, not pages: what `useQuery` reads. */
export type SingleQueryFactory = {
	factory(input: unknown): ReturnType<QueryFactory> & {
		readonly getNextPageParam?: never;
	};
}["factory"];

/** A factory of paged queries (`infiniteQueryOptions`): what `useInfiniteQuery` reads. */
export type InfiniteQueryFactory = {
	factory(input: unknown): ReturnType<QueryFactory> & {
		readonly getNextPageParam: (...args: never) => unknown;
	};
}["factory"];

/** Call a factory with an input its caller's types already checked. */
export function optionsOf(factory: AnyFactory, input: unknown): QueryOptions {
	// SAFETY: factories return query options, and callers type `input`.
	const call = factory as (input: unknown) => QueryOptions;
	return call(input);
}

/** What a reader gets: the `select`ed data, or else the `queryFn`'s. */
export type DataOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends { readonly [dataTag]?: infer TData }
		? TData
		: never;

/** The `fail()` values a factory's `queryFn` returns. */
export type ErrorOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends { readonly [failTag]?: infer TFail }
		? TFail
		: never;

/** A factory's input: its first parameter, or `undefined` if it takes none. */
export type InputOf<TFactory extends QueryFactory> =
	Parameters<TFactory> extends [] ? undefined : Parameters<TFactory>[0];

/** The input arguments of a factory: none, or its input. */
export type InputArgs<TFactory extends QueryFactory> =
	Parameters<TFactory> extends []
		? []
		: Parameters<TFactory> extends [infer TInput, ...Array<unknown>]
			? [input: TInput]
			: [input?: Parameters<TFactory>[0]];

/** A factory's key type, the way handles carry it. */
export type KeyOf<TFactory extends QueryFactory> =
	ReturnType<TFactory>["queryKey"];

/** A factory's root, from its `def`; any root without one. */
export type RootOfFactory<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends { readonly def?: Def<infer TTypes> }
		? TTypes extends DefaultTypes
			? AnyRoot
			: TTypes
		: AnyRoot;
