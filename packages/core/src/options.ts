import type { QueryClient } from "./client.ts";
import type { AnyFactory, QueryKey } from "./keys/keys.ts";
import type { NoParts, RootOf, RootTag, RootTypes, SetsOf } from "./root.ts";

/**
 * What a `queryFn` gets: the client making the request, the query's key and
 * abort `signal`, and what the client's parts give every `queryFn`.
 *
 * @see https://raf-query.katt.dev/docs/query-functions#the-query-function-context
 */
export type QueryFunctionContext<
	TKey extends QueryKey = QueryKey,
	TTypes extends RootTypes = NoParts,
> = TTypes["context"] & {
	/**
	 * The client making the request. A server makes one per request, so
	 * what its parts give the context belongs to that request, such as an
	 * API client with the request's cookies.
	 */
	readonly client: QueryClient<TTypes>;
	readonly queryKey: TKey;
	/** Aborted when the request is restarted or its entry is removed. */
	readonly signal: AbortSignal;
};

declare const dataTag: unique symbol;
declare const queryFnDataTag: unique symbol;

/**
 * The per-query options the core reads, whatever parts the client has. A
 * client's `defaults` set them for every query.
 *
 * @see https://raf-query.katt.dev/docs/important-defaults#changing-the-defaults
 */
export interface CoreOptions {
	/** How long an entry with no reader stays cached. Default 5 minutes; never on the server. */
	readonly gcTime?: number;
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

/** Options every query takes. */
export interface BaseOptions<TKey extends QueryKey> extends CoreOptions {
	/** A plain array, usually built by a `group()`. Handles keep its literal type. */
	readonly queryKey: TKey;
}

/**
 * The options a builder bound to `T` lets a query set, beside its key and
 * `queryFn`: the core's, and those `T`'s parts declare. For a fragment
 * several factories share:
 *
 * ```ts
 * const pinned = { retry: false, staleTime: Infinity } satisfies OptionsOf<typeof makeQueryClient>;
 * ```
 *
 * @see https://raf-query.katt.dev/docs/links-and-features#typing-options-by-the-client
 */
export type OptionsOf<T> = CoreOptions & Partial<SetsOf<T>["options"]>;

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
> extends BaseOptions<TKey> {
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
 * `queryOptions` for a root: `TTypes` is what the factories it builds need
 * of a client, and `TSets` the options they can set.
 *
 * @see https://raf-query.katt.dev/docs/links-and-features#typing-options-by-the-client
 */
export interface QueryOptionsBuilder<
	TTypes extends RootTypes,
	TSets extends RootTypes = TTypes,
> {
	<const TKey extends QueryKey, TChunk, TData>(
		options: BaseOptions<TKey> &
			Partial<TSets["options"]> & {
				readonly queryFn: (
					context: QueryFunctionContext<TKey, TTypes>,
				) => AsyncIterable<TChunk>;
				readonly stream: StreamOptions<TData, TChunk>;
			},
	): QueryOptions<TKey, TData, TData, TTypes>;
	<const TKey extends QueryKey, TQueryFnData, TData = TQueryFnData>(
		options: BaseOptions<TKey> &
			Partial<TSets["options"]> & {
				readonly queryFn: (
					context: QueryFunctionContext<TKey, TTypes>,
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
 * It takes the core's options only, and its factories run on any client.
 * For the options and the `queryFn` context a client's parts declare, use
 * the builder {@link bindQueryOptions} returns.
 *
 * @see https://raf-query.katt.dev/docs/query-factories
 */
export const queryOptions: QueryOptionsBuilder<NoParts> = <TOptions>(
	options: TOptions,
) => options;

/**
 * `queryOptions` bound to a root: it takes the options the root's parts
 * declare, its `queryFn`s get their context, and its factories run on the
 * clients that have those parts. `T` is the client's type, or the type of a
 * function that makes it. Bind once per client:
 *
 * ```ts
 * // raf.ts
 * export const queryOptions = bindQueryOptions<typeof makeQueryClient>();
 * ```
 *
 * A library names the parts its factories need by their declarations, and
 * as `Optional` the ones whose options it sets where the client has them:
 *
 * ```ts
 * const queryOptions = bindQueryOptions<Convex & Optional<Retry>>();
 * ```
 *
 * It returns `queryOptions` itself; only the types change.
 *
 * @see https://raf-query.katt.dev/docs/links-and-features#typing-options-by-the-client
 */
export function bindQueryOptions<T>(): QueryOptionsBuilder<
	RootOf<T>,
	SetsOf<T>
> {
	// SAFETY: the root is a phantom; the builder never reads it.
	return queryOptions as QueryOptionsBuilder<RootOf<T>, SetsOf<T>>;
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

/** The root a factory's builder is bound to: what the factory needs of a client. */
export type RootOfFactory<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends { readonly "~root"?: RootTag<infer TTypes> }
		? TTypes
		: NoParts;
