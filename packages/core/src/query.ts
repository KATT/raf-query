/**
 * One cache entry, as a data type: a `Query` carries its key, handle and
 * options, and the functions here read it, subscribe to it and run its
 * requests. Get one from `QueryCache.getQuery(cache, factory, input)`.
 *
 * Requests are promises. The `*Unsafe` functions read and subscribe
 * synchronously, for renders and external stores. `@raf-query/core/effect`
 * has the same functions as Effects.
 */
import { unsafeCast } from "./cast.ts";
import * as internal from "./entry.ts";
import type { Direction } from "./infinite.ts";
import type { QueryKey } from "./key.ts";
import type {
	AnyQueryOptions,
	DataOf,
	ErrorOf,
	QueryFactory,
	QueryHandle,
	QueryMeta,
} from "./options.ts";
import { CancelledError as Cancelled, unwrap } from "./outcome.ts";
import type { Thenable } from "./thenable.ts";

export const TypeId: typeof internal.TypeId = internal.TypeId;

export type TypeId = typeof TypeId;

export interface Query<
	TData = unknown,
	TFactory extends QueryFactory = QueryFactory,
	TError = unknown,
> {
	/** The serializable handle for this entry's factory call. */
	readonly handle: QueryHandle<TFactory>;
	/** Stable string form of `key`. */
	readonly hash: string;
	readonly key: QueryKey;
	/** Options from the latest factory call; `undefined` for an entry only hydrated so far. */
	readonly options: AnyQueryOptions | undefined;
	readonly [TypeId]: {
		readonly _A: (_: never) => TData;
		readonly _E: (_: never) => TError;
	};
}

/** The entry of a factory call, typed by the factory. */
export type Of<TFactory extends QueryFactory> = Query<
	DataOf<TFactory>,
	TFactory,
	ErrorOf<TFactory>
>;

/** A snapshot of one cache entry. Replaced, never mutated, on every change. */
export interface State<TData> {
	/** Last successful data, kept through background errors. */
	readonly data: TData | undefined;
	/** Error of the last failed request, or `null`. */
	readonly error: unknown;
	/** Failed attempts of the current request, retries included. */
	readonly failureCount: number;
	/** Set while a paged query loads a page at one end of the list. */
	readonly fetchDirection: Direction | undefined;
	readonly hasData: boolean;
	/** A request is in flight. */
	readonly isFetching: boolean;
	/** Marked stale by `invalidate`; cleared by the next successful request. */
	readonly isInvalidated: boolean;
	/** Older than `staleTime`, invalidated, or without data. */
	readonly isStale: boolean;
	/**
	 * Settles with `data`. A new promise is created per data version, already
	 * fulfilled once data exists, so it can be read synchronously.
	 */
	readonly promise: Thenable<TData>;
	readonly status: "error" | "pending" | "success";
	/** When `data` was fetched (ms since epoch); `0` without data. */
	readonly updatedAt: number;
}

/** Per-reader preferences, registered with {@link subscribeUnsafe}. */
export interface SubscribeOptions {
	readonly refetchOnReconnect?: boolean;
	readonly refetchOnWindowFocus?: boolean;
}

export interface FetchRequest {
	/** Load one more page at this end of a paged query. */
	readonly direction?: Direction;
	/** Pages to load when a paged query has none yet. */
	readonly pages?: number;
	/** Abort an in-flight request and start over (used by `invalidate`). */
	readonly restart?: boolean;
}

export const CancelledError: typeof Cancelled = Cancelled;

export type CancelledError = Cancelled;

export const isQuery: (value: unknown) => value is Query = internal.isQuery;

function typedState<TData>(state: State<unknown>): State<TData> {
	// SAFETY: an entry is keyed by its factory's `queryKey`, and only that
	// factory's `queryFn` (or data written through it) fills it, so `data`
	// and `promise` hold the factory's data.
	return unsafeCast<State<TData>>(state);
}

/**
 * Start a request, or join the one in flight. Rejects with the request's
 * error, or a {@link CancelledError} if the entry leaves the cache first.
 */
export async function fetch<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
	request?: FetchRequest,
): Promise<TData> {
	const outcome = await internal.fetch(internal.entryOf(self), request);
	// SAFETY: as in `typedState`.
	return unsafeCast<TData>(unwrap(outcome));
}

/** Refetch now; resolves when the request settles, whatever its outcome. */
export function refetch<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Promise<void> {
	return internal.entryOf(self).commands.refetch();
}

/** Load the page after the last one; resolves once it settles. */
export function fetchNextPage<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Promise<void> {
	return internal.entryOf(self).commands.fetchNextPage();
}

/** Load the page before the first one; resolves once it settles. */
export function fetchPreviousPage<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Promise<void> {
	return internal.entryOf(self).commands.fetchPreviousPage();
}

/** Mark stale, and refetch if read; resolves once that refetch settles. */
export function invalidate<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Promise<void> {
	return internal.invalidate(internal.entryOf(self));
}

/**
 * Drop data and errors, back to the state of a new entry. Readers suspend
 * and refetch; resolves when that refetch settles.
 */
export function reset<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Promise<void> {
	return internal.reset(internal.entryOf(self));
}

/**
 * The query's `meta`: the latest factory call's (the one it was hydrated
 * with, before any), else the cache default's.
 */
export function metaUnsafe<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): QueryMeta | undefined {
	return internal.metaOf(internal.entryOf(self));
}

/** The entry's current state. */
export function getUnsafe<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): State<TData> {
	return typedState<TData>(internal.entryOf(self).state);
}

/**
 * The promise a render should unwrap. Starts the first request if nothing
 * has, and retries a failed first load once its error has been shown.
 */
export function readUnsafe<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): Thenable<TData> {
	// SAFETY: as in `typedState`.
	return unsafeCast<Thenable<TData>>(
		internal.readUnsafe(internal.entryOf(self)),
	);
}

/** Listen for state changes. Subscribed entries count as read. */
export function subscribeUnsafe<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
	listener: () => void,
	options?: SubscribeOptions,
): () => void {
	return internal.subscribeUnsafe(internal.entryOf(self), listener, options);
}

/** Staleness as of now; `state.isStale` is only kept current while read. */
export function isStaleUnsafe<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): boolean {
	return internal.isStaleUnsafe(internal.entryOf(self));
}

export function hasNextPageUnsafe<TData, TFactory extends QueryFactory, TError>(
	self: Query<TData, TFactory, TError>,
): boolean {
	return internal.hasNextPageUnsafe(internal.entryOf(self));
}

export function hasPreviousPageUnsafe<
	TData,
	TFactory extends QueryFactory,
	TError,
>(self: Query<TData, TFactory, TError>): boolean {
	return internal.hasPreviousPageUnsafe(internal.entryOf(self));
}

/** Readers currently subscribed. */
export function observerCountUnsafe<
	TData,
	TFactory extends QueryFactory,
	TError,
>(self: Query<TData, TFactory, TError>): number {
	return internal.entryOf(self).listeners.size;
}
