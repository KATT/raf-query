import type { QueryClient } from "./client.ts";
import type { AnyFactory, QueryKey } from "./keys/keys.ts";
import type {
	AnyRoot,
	DefaultTypes,
	RootOf,
	RootTag,
	RootTypes,
} from "./root.ts";

/**
 * What a `queryFn` gets: the client making the request, the query's key,
 * `meta` and abort `signal`.
 *
 * @see https://raf-query.katt.dev/docs/query-functions#the-query-function-context
 */
export interface QueryFunctionContext<TKey extends QueryKey = QueryKey> {
	/**
	 * The client making the request. A server makes one per request, so it
	 * keys per-request services, such as an API client with the request's
	 * cookies.
	 */
	readonly client: QueryClient;
	/** The query's `meta`, typed by its root where the query is defined. */
	readonly meta: object;
	readonly queryKey: TKey;
	/** Aborted when the request is restarted or its entry is removed. */
	readonly signal: AbortSignal;
}

declare const dataTag: unique symbol;
declare const queryFnDataTag: unique symbol;

/** Options every query takes. */
export interface BaseOptions<
	TKey extends QueryKey,
	TTypes extends RootTypes = RootTypes,
> {
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
	/**
	 * `false` for a query only a browser can run (a permission, the service
	 * worker, `localStorage`): a server client never starts it, never sends
	 * it, and reads it as not loaded yet, so the browser runs it once it
	 * renders. Default `true`.
	 *
	 * @see https://raf-query.katt.dev/docs/ssr-and-hydration#browser-only-queries
	 */
	readonly ssr?: boolean;
	/** How long data stays fresh, in ms. Default `0`. */
	readonly staleTime?: number;
	/** Keep the deeply equal parts of new data, so they keep their identity. Default `true`. */
	readonly structuralSharing?: boolean;
}

/**
 * What `queryOptions` and `infiniteQueryOptions` return.
 *
 * @see https://raf-query.katt.dev/docs/api-reference#query-factories
 */
export interface QueryOptions<
	TKey extends QueryKey = QueryKey,
	TQueryFnData = unknown,
	TData = TQueryFnData,
	TTypes extends RootTypes = RootTypes,
> extends BaseOptions<TKey, TTypes> {
	/** Set by `infiniteQueryOptions` from `keepPages`: whether `load` keeps the cached pages. */
	readonly "~keep"?: (data: never) => boolean;
	/** Phantom: the root the builder is bound to. Never set at runtime. */
	readonly "~root"?: RootTag<TTypes>;
	/** Set by `infiniteQueryOptions`: runs the request page by page. */
	readonly "~run"?: (op: never) => Promise<unknown>;
	readonly [dataTag]?: TData;
	readonly queryFn: (context: never) => unknown;
	/**
	 * Phantom: the `queryFn`'s data, before `select`. What `setData` writes,
	 * read from a property rather than `select`'s parameter, so a factory
	 * built inline by a generic maker still infers where it's passed.
	 */
	readonly [queryFnDataTag]?: TQueryFnData;
	readonly select?: (data: TQueryFnData) => TData;
	readonly stream?: StreamOptions<TQueryFnData, never>;
}

/**
 * How a `queryFn` that returns an async iterable folds its chunks into data.
 *
 * @see https://raf-query.katt.dev/docs/query-functions#streaming
 */
export interface StreamOptions<TData, TChunk> {
	/** The data before the first chunk. */
	readonly initial: TData;
	/** Fold a chunk into the data. */
	readonly reduce: (data: TData, chunk: TChunk) => TData;
}

type Awaitable<T> = PromiseLike<T> | T;

/**
 * `T` as a conditional type, so a builder infers its data type from the
 * `queryFn` alone: an annotated `select` or `getNextPageParam` parameter
 * doesn't widen it.
 */
export type FromQueryFn<T> = T extends unknown ? T : never;

/**
 * `queryOptions`, with `meta` checked against the root `TTypes`.
 *
 * @see https://raf-query.katt.dev/docs/links-and-features#typing-meta-by-its-root
 */
export interface QueryOptionsBuilder<TTypes extends RootTypes> {
	<const TKey extends QueryKey, TChunk, TData>(
		options: BaseOptions<TKey, TTypes> & {
			readonly queryFn: (
				context: QueryFunctionContext<TKey>,
			) => AsyncIterable<TChunk>;
			readonly stream: StreamOptions<TData, TChunk>;
		},
	): QueryOptions<TKey, TData, TData, TTypes>;
	<const TKey extends QueryKey, TQueryFnData, TData = TQueryFnData>(
		options: BaseOptions<TKey, TTypes> & {
			readonly queryFn: (
				context: QueryFunctionContext<TKey>,
			) => Awaitable<TQueryFnData>;
			readonly select?: (data: FromQueryFn<TQueryFnData>) => TData;
		},
	): QueryOptions<TKey, TQueryFnData, TData, TTypes>;
}

/**
 * Typed options for a query factory:
 *
 * ```ts
 * export const postQuery = (input: { slug: string }) =>
 *   queryOptions({
 *     queryKey: posts(input.slug),
 *     queryFn: ({ signal }) => getPost(input.slug, { signal }),
 *   });
 * ```
 *
 * A `queryFn` that returns an async iterable is a stream: pass `stream` to
 * fold its chunks into the data. Readers get the data after the first chunk,
 * and every later chunk updates it in place.
 *
 * Its `meta` is any record. To check `meta` against a client's links and
 * features, use the builder {@link bindQueryOptions} returns.
 *
 * @see https://raf-query.katt.dev/docs/query-factories
 */
export const queryOptions: QueryOptionsBuilder<DefaultTypes> = <TOptions>(
	options: TOptions,
) => options;

/**
 * `queryOptions` bound to a root: `meta` takes the fields the root's links
 * and features declare, and verbs take only that root's clients. `T` is the
 * client's type, or the type of a function that makes it. Bind once per app:
 *
 * ```ts
 * // raf.ts
 * export const queryOptions = bindQueryOptions<typeof makeQueryClient>();
 * ```
 *
 * It returns `queryOptions` itself; only the types change.
 *
 * @see https://raf-query.katt.dev/docs/links-and-features#typing-meta-by-its-root
 */
export function bindQueryOptions<T>(): QueryOptionsBuilder<RootOf<T>> {
	// SAFETY: the root is a phantom; the builder never reads it.
	return queryOptions as QueryOptionsBuilder<RootOf<T>>;
}

/**
 * A function of the query's input that returns its options. The input is a
 * method parameter typed `unknown`, which TypeScript checks bivariantly:
 * every factory fits, and an inline generic factory maker passed where a
 * `QueryFactory` is expected infers its own type parameters instead of
 * `never`.
 *
 * @see https://raf-query.katt.dev/docs/query-factories
 */
export type QueryFactory = {
	factory(input: unknown): {
		readonly queryFn: (context: never) => unknown;
		readonly queryKey: QueryKey;
	};
}["factory"];

/**
 * A factory whose query has one value, not pages: what `useQuery` reads.
 *
 * @see https://raf-query.katt.dev/docs/query-factories
 */
export type SingleQueryFactory = {
	factory(input: unknown): ReturnType<QueryFactory> & {
		readonly getNextPageParam?: never;
	};
}["factory"];

/**
 * A factory of paged queries (`infiniteQueryOptions`): what `useInfiniteQuery` reads.
 *
 * @see https://raf-query.katt.dev/docs/query-factories
 */
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

/** The `queryFn`'s data, before `select`: what `setData` writes and `getData` reads. */
export type QueryFnDataOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends { readonly [queryFnDataTag]?: infer TData }
		? TData
		: unknown;

/**
 * What a reader gets: the `select`ed data, or else the `queryFn`'s.
 *
 * @see https://raf-query.katt.dev/docs/query-factories#type-inference
 */
export type DataOf<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends { readonly [dataTag]?: infer TData }
		? TData
		: never;

/**
 * A factory's input: its first parameter, or `undefined` if it takes none.
 *
 * @see https://raf-query.katt.dev/docs/query-factories#type-inference
 */
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

/** The root a factory's builder is bound to; any root for an unbound one. */
export type RootOfFactory<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends { readonly "~root"?: RootTag<infer TTypes> }
		? TTypes extends DefaultTypes
			? AnyRoot
			: TTypes
		: AnyRoot;
