import {
	type DataTag,
	type DefaultError,
	type GetNextPageParamFunction,
	type GetPreviousPageParamFunction,
	hashKey,
	type InfiniteData,
	type InfiniteQueryObserverOptions,
	type QueryClient,
	type QueryFunction,
	type QueryKey,
	type QueryObserverOptions,
} from "@tanstack/react-query";

import { unsafeCast } from "./cast.ts";

/**
 * The TanStack options a factory may set. The rest (`enabled`, `select`,
 * `placeholderData`, `initialData`, `refetchOnMount`, `suspense`,
 * `throwOnError`, …) are decided by where a query starts and how it is read,
 * so they are not per-query settings here.
 */
type BehaviorKey =
	| "gcTime"
	| "meta"
	| "networkMode"
	| "refetchOnReconnect"
	| "refetchOnWindowFocus"
	| "retry"
	| "retryDelay"
	| "staleTime"
	| "structuralSharing";

export type QueryBehavior<TData> = Pick<
	QueryObserverOptions<TData, DefaultError, TData, TData, QueryKey>,
	BehaviorKey
>;

export type InfiniteQueryBehavior<TPage, TPageParam> = Pick<
	InfiniteQueryObserverOptions<
		TPage,
		DefaultError,
		InfiniteData<TPage, TPageParam>,
		QueryKey,
		TPageParam
	>,
	BehaviorKey
>;

/** What `queryOptions` takes. */
export interface QueryOptionsInput<TData> extends QueryBehavior<TData> {
	queryFn: QueryFunction<TData, QueryKey>;
	queryKey: QueryKey;
}

/**
 * Options for a plain query. `queryKey` carries TanStack's data tag, so
 * `queryClient.getQueryData(issueQuery(input).queryKey)` is typed.
 */
export interface QueryOptions<TData> extends QueryOptionsInput<TData> {
	readonly kind: "query";
	queryKey: DataTag<QueryKey, TData, DefaultError>;
}

/** What `infiniteQueryOptions` takes. */
export interface InfiniteQueryOptionsInput<
	TPage,
	TPageParam,
> extends InfiniteQueryBehavior<TPage, TPageParam> {
	/** Param for the page after `lastPage`, or `null` / `undefined` at the end. */
	getNextPageParam: GetNextPageParamFunction<TPageParam, TPage>;
	/** Param for the page before `firstPage`, or `null` / `undefined` at the start. */
	getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, TPage>;
	initialPageParam: TPageParam;
	/** Keep at most this many pages; the far end is dropped when paging. */
	maxPages?: number;
	queryFn: QueryFunction<TPage, QueryKey, TPageParam>;
	queryKey: QueryKey;
}

/** Options for a paged query. Its data is `{ pages, pageParams }`. */
export interface InfiniteQueryOptions<
	TPage,
	TPageParam,
> extends InfiniteQueryOptionsInput<TPage, TPageParam> {
	readonly kind: "infinite";
	queryKey: DataTag<QueryKey, InfiniteData<TPage, TPageParam>, DefaultError>;
}

/** The part of either options shape that holds without knowing the data type. */
export interface AnyQueryOptions {
	readonly kind: "infinite" | "query";
	readonly queryKey: QueryKey;
}

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
	options: QueryOptionsInput<TData>,
): QueryOptions<TData> {
	// SAFETY: the data tag on `queryKey` is type-only (TanStack's own
	// `queryOptions` is the identity function); `queryFn` produces `TData`.
	return unsafeCast<QueryOptions<TData>>({ ...options, kind: "query" });
}

/** Typed options for a paged query factory. */
export function infiniteQueryOptions<TPage, TPageParam>(
	options: InfiniteQueryOptionsInput<TPage, TPageParam>,
): InfiniteQueryOptions<TPage, TPageParam> {
	// SAFETY: as in `queryOptions`; the paged `queryFn` and page params make
	// the entry's data `InfiniteData<TPage, TPageParam>`.
	return unsafeCast<InfiniteQueryOptions<TPage, TPageParam>>({
		...options,
		kind: "infinite",
	});
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

/** The data a factory's query resolves to, read from its key's data tag. */
export type DataOf<TFactory extends QueryFactory> =
	ReturnType<TFactory>["queryKey"] extends DataTag<
		unknown,
		infer TData,
		unknown
	>
		? TData
		: never;

/** `ensure` / `ensureData` options. Only paged factories accept `pages`. */
export type LoadOptions<TFactory extends QueryFactory> =
	IsPaged<TFactory> extends true
		? {
				/** Load this many pages up front (default 1). */
				readonly pages?: number;
			}
		: never;

/** `ensure` / `ensureData` arguments: the input, then load options for paged factories. */
export type LoadArgs<TFactory extends QueryFactory> =
	| InputArgs<TFactory>
	| [input: InputOf<TFactory>, options: LoadOptions<TFactory>];

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

export function handleOf<TFactory extends QueryFactory>(
	options: AnyQueryOptions,
	input: unknown,
): QueryHandle<TFactory> {
	// SAFETY: `input` is what the caller passed for this factory, which
	// `InputArgs<TFactory>` type-checked.
	return unsafeCast<QueryHandle<TFactory>>({ input, key: options.queryKey });
}

/** Input hashes seen per key hash, to catch keys that leave out the input. */
const inputsByClient = new WeakMap<QueryClient, Map<string, string>>();
/** Stored for a key once it has been warned about, so it warns once. */
const warned = "";

function checkKeyCoversInput(
	client: QueryClient,
	options: AnyQueryOptions,
	input: unknown,
) {
	let inputs = inputsByClient.get(client);
	if (!inputs) {
		inputs = new Map();
		inputsByClient.set(client, inputs);
	}
	const keyHash = hashKey(options.queryKey);
	const inputHash = hashKey([input]);
	const seen = inputs.get(keyHash);
	if (seen === undefined) {
		inputs.set(keyHash, inputHash);
	} else if (seen !== inputHash && seen !== warned) {
		inputs.set(keyHash, warned);
		// oxlint-disable-next-line eslint/no-console
		console.warn(
			`raf-query: inputs ${seen} and ${inputHash} share the query key ${keyHash}. Put every field the queryFn reads in queryKey, or they'll read each other's data.`,
		);
	}
}

/**
 * Calls a factory with an input the caller has already type-checked against
 * `InputArgs<TFactory>`. Outside production, warns when two inputs of a
 * factory produce the same key.
 */
export function optionsFor(
	client: QueryClient,
	factory: QueryFactory,
	input: unknown,
): AnyQueryOptions {
	// SAFETY: every caller passes the factory's own input (typed through
	// `InputArgs<TFactory>`); `QueryFactory` erases it to `never` only so that
	// any one-argument factory is assignable.
	// oxlint-disable-next-line typescript/consistent-type-assertions
	const call = factory as (input: unknown) => AnyQueryOptions;
	const options = call(input);
	if (process.env.NODE_ENV !== "production") {
		checkKeyCoversInput(client, options, input);
	}
	return options;
}
