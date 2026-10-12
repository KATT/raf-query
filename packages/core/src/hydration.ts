import { Effect } from "effect";

import type { QueryKey } from "./key.ts";
import type { Query, QueryEntry } from "./query.ts";

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

/** What dehydrating reads from an entry; any typed `Query` has it. */
export type DehydratableQuery = Pick<Query, "getStateUnsafe" | "hash" | "key">;

const noop = () => {};
const identity = <T>(value: T) => value;

/** The default dehydrate filter: entries with data or a request in flight. */
export function canDehydrate(query: DehydratableQuery): boolean {
	const state = query.getStateUnsafe();
	return state.hasData || state.isFetching;
}

export function dehydrateUnsafe(
	query: DehydratableQuery,
	options: DehydrateOptions,
): DehydratedQuery {
	const state = query.getStateUnsafe();
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

/** Snapshot one entry for transfer. */
export function dehydrateQuery(
	query: DehydratableQuery,
	options: DehydrateOptions = {},
): Effect.Effect<DehydratedQuery> {
	return Effect.sync(() => dehydrateUnsafe(query, options));
}

/**
 * Write dehydrated entries into a cache. Existing entries only take newer
 * data; pending entries resume the sender's request.
 */
export function hydrateEntries(
	entryFor: (key: QueryKey) => QueryEntry,
	state: DehydratedState,
	options: HydrateOptions,
): void {
	const deserialize = options.deserializeData ?? identity;
	for (const query of state.queries) {
		const entry = entryFor(query.key);
		const current = entry.getStateUnsafe();
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
