import type { Fail } from "./fail.ts";
import type { AnyFactory, QueryKeyOption, Tag } from "./keys.ts";

/** Free-form data on a query, for links and features. */
export type QueryMeta = Readonly<Record<string, unknown>>;

export interface QueryFunctionContext<
	TKey extends QueryKeyOption = QueryKeyOption,
> {
	readonly meta: QueryMeta | undefined;
	readonly queryKey: TKey;
	/** Aborted when the request is restarted or its entry is removed. */
	readonly signal: AbortSignal;
}

declare const dataTag: unique symbol;
declare const failTag: unique symbol;

/** Options every query takes. */
export interface BaseOptions<TKey extends QueryKeyOption, TQueryFnData> {
	/** `false`: the query doesn't run. Default `true`. */
	readonly enabled?: boolean;
	/** How long an entry with no reader stays cached. Default 5 minutes; never on the server. */
	readonly gcTime?: number;
	readonly meta?: QueryMeta;
	readonly queryKey: TKey;
	/** With the `polling()` feature: refetch every `n` ms while read. */
	readonly refetchInterval?: number | false;
	/** With the `retry()` link: attempts for this query, or `false`. */
	readonly retry?: number | false;
	/** How long data stays fresh, in ms. Default `0`. */
	readonly staleTime?: number;
	/** Keep the deeply equal parts of new data, so they keep their identity. Default `true`. */
	readonly structuralSharing?: boolean;
	/** Tags to invalidate the query by, fixed or derived from its data. */
	readonly tags?:
		| ReadonlyArray<Tag>
		| ((data: TQueryFnData) => ReadonlyArray<Tag>);
}

/** What `queryOptions` and `infiniteQueryOptions` return. */
export interface QueryOptions<
	TKey extends QueryKeyOption = QueryKeyOption,
	TQueryFnData = unknown,
	TFail = unknown,
	TData = TQueryFnData,
> extends BaseOptions<TKey, TQueryFnData> {
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
 *     queryKey: [issues, "byId", input],
 *     queryFn: ({ signal }) => getIssue(input.id, { signal }),
 *   });
 * ```
 *
 * A `queryFn` that returns an async iterable is a stream: pass `stream` to
 * fold its chunks into the data. Readers get the data after the first chunk,
 * and every later chunk updates it in place.
 */
export function queryOptions<const TKey extends QueryKeyOption, TChunk, TData>(
	options: BaseOptions<TKey, TData> & {
		readonly queryFn: (
			context: QueryFunctionContext<TKey>,
		) => AsyncIterable<TChunk>;
		readonly stream: StreamOptions<TData, TChunk>;
	},
): QueryOptions<TKey, TData, never, TData>;
export function queryOptions<
	const TKey extends QueryKeyOption,
	TResult,
	TData = Exclude<TResult, Fail>,
>(
	options: BaseOptions<TKey, Exclude<TResult, Fail>> & {
		readonly queryFn: (
			context: QueryFunctionContext<TKey>,
		) => Awaitable<TResult>;
		readonly select?: (data: Exclude<TResult, Fail>) => TData;
	},
): QueryOptions<TKey, Exclude<TResult, Fail>, Extract<TResult, Fail>, TData>;
export function queryOptions(options: QueryOptions): QueryOptions {
	return options;
}

/** A function of the query's input that returns its options. */
export type QueryFactory = (input: never) => {
	readonly queryFn: (context: never) => unknown;
	readonly queryKey: QueryKeyOption;
};

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

export type KeyOf<TFactory extends QueryFactory> =
	ReturnType<TFactory>["queryKey"];
