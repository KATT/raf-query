import { cacheOf, type QueryClient } from "./client.ts";
import type { QueryKey } from "./key.ts";
import type { Query } from "./query.ts";

/**
 * One cache entry in transit. Settled entries carry `data`; entries still
 * loading their first data carry the request's `promise`, so the receiving
 * cache resumes it instead of fetching again.
 */
export interface DehydratedQuery {
	readonly data?: unknown;
	readonly key: QueryKey;
	readonly promise?: Promise<unknown>;
	/** When `data` was fetched; `0` while pending. */
	readonly updatedAt: number;
}

export interface DehydratedState {
	readonly queries: ReadonlyArray<DehydratedQuery>;
}

export interface DehydrateOptions {
	/**
	 * Which entries to send. Default: entries with data or a request in
	 * flight ({@link canDehydrate}).
	 */
	readonly filter?: (query: Query) => boolean;
	/**
	 * Send a pending query's rejection as-is. By default the receiving side
	 * gets a generic error, so server errors don't leak into the page; its
	 * error boundary can still retry on the client.
	 */
	readonly keepErrors?: boolean;
	/** Transform data before it is serialized. */
	readonly serializeData?: (data: unknown) => unknown;
}

export interface HydrateOptions {
	/** Reverse `serializeData`. */
	readonly deserializeData?: (data: unknown) => unknown;
}

const noop = () => {};
const identity = <T>(value: T) => value;

/** The default dehydrate filter: entries with data or a request in flight. */
export function canDehydrate(query: Query): boolean {
	const state = query.getState();
	return state.hasData || state.isFetching;
}

/** Snapshot one entry for transfer. */
export function dehydrateQuery(
	query: Query,
	options: DehydrateOptions = {},
): DehydratedQuery {
	const state = query.getState();
	const serialize = options.serializeData ?? identity;
	if (state.hasData) {
		return {
			data: serialize(state.data),
			key: query.key,
			updatedAt: state.updatedAt,
		};
	}
	const promise = state.promise.then(serialize, (error: unknown) => {
		throw options.keepErrors ? error : new Error(`Query ${query.hash} failed`);
	});
	promise.catch(noop);
	return { key: query.key, promise, updatedAt: 0 };
}

/** Snapshot the cache for transfer to another client (server → browser). */
export function dehydrate(
	client: QueryClient,
	options: DehydrateOptions = {},
): DehydratedState {
	const filter = options.filter ?? canDehydrate;
	return {
		queries: client
			.getAll()
			.filter(filter)
			.map((query) => dehydrateQuery(query, options)),
	};
}

/**
 * Write dehydrated entries into a client. Existing entries only take newer
 * data; pending entries resume the sender's request.
 */
export function hydrate(
	client: QueryClient,
	state: DehydratedState,
	options: HydrateOptions = {},
): void {
	const deserialize = options.deserializeData ?? identity;
	const cache = cacheOf(client);
	for (const query of state.queries) {
		const entry = cache.entryFor(query.key);
		const current = entry.getState();
		if (query.updatedAt > 0) {
			if (!current.hasData || current.updatedAt < query.updatedAt) {
				entry.setData(deserialize(query.data), query.updatedAt);
			}
		} else if (query.promise && !current.hasData) {
			// Flight-decoded promises are thenables, not always real promises.
			entry.resume(Promise.resolve(query.promise).then(deserialize));
		}
	}
}
