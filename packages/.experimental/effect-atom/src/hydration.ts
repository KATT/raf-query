import type { QueryKey } from "@raf-query/core";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";

import * as Entry from "./entry.ts";
import { firstLoadPromise } from "./thenable.ts";

/**
 * One query in transit. Settled queries carry `data`; queries still loading
 * their first data carry the request's `promise`, so the receiving cache
 * resumes it instead of fetching again.
 */
export interface DehydratedQuery {
	readonly data?: unknown;
	readonly key: QueryKey;
	readonly promise?: PromiseLike<unknown>;
	/** When `data` was fetched; `0` while pending. */
	readonly updatedAt: number;
}

export interface DehydratedState {
	readonly queries: ReadonlyArray<DehydratedQuery>;
}

export interface DehydrateOptions {
	/**
	 * Send a pending query's rejection as-is. By default the receiving side
	 * gets a generic error, so server errors don't leak into the page.
	 */
	readonly keepErrors?: boolean;
	/** Transform data before it is serialized. */
	readonly serializeData?: (data: unknown) => unknown;
}

export interface HydrateOptions {
	/** Reverse `serializeData`. */
	readonly deserializeData?: (data: unknown) => unknown;
}

function noop() {}

function identity<T>(value: T): T {
	return value;
}

/**
 * Snapshot one entry: its data, or its first load's promise while that
 * request is in flight. `undefined` for entries with neither.
 */
export function dehydrateUnsafe(
	entry: Entry.Entry,
	options: DehydrateOptions,
): DehydratedQuery | undefined {
	const result = Entry.peekUnsafe(entry);
	if (Option.isNone(result)) {
		return undefined;
	}
	const serialize = options.serializeData ?? identity;
	const key = entry.options.queryKey;
	const value = AsyncResult.value(result.value);
	if (Option.isSome(value)) {
		return {
			data: serialize(value.value),
			key,
			updatedAt: Entry.updatedAt(result.value) ?? 0,
		};
	}
	if (!result.value.waiting) {
		return undefined;
	}
	const promise = firstLoadPromise(entry).then(serialize, (error: unknown) => {
		throw options.keepErrors ? error : new Error(`Query ${entry.hash} failed`);
	});
	promise.catch(noop);
	return { key, promise, updatedAt: 0 };
}

/** `query` with `deserializeData` applied to its data or promise. */
export function deserialize(
	query: DehydratedQuery,
	options: HydrateOptions,
): DehydratedQuery {
	const decode = options.deserializeData ?? identity;
	if (query.updatedAt > 0) {
		return {
			data: decode(query.data),
			key: query.key,
			updatedAt: query.updatedAt,
		};
	}
	if (query.promise === undefined) {
		return query;
	}
	// Flight-decoded promises are thenables, not always real promises.
	const promise = Promise.resolve(query.promise).then(decode);
	promise.catch(noop);
	return { key: query.key, promise, updatedAt: 0 };
}

/** The one of two snapshots of a query to keep: settled and newer wins. */
export function newer(
	current: DehydratedQuery,
	next: DehydratedQuery,
): DehydratedQuery {
	if (next.updatedAt > 0) {
		return current.updatedAt < next.updatedAt ? next : current;
	}
	return current.updatedAt > 0 ? current : next;
}

/**
 * Write a deserialized query into its entry. Data replaces only older data;
 * a pending query resumes the sender's request if the entry has neither
 * data nor a request of its own.
 */
export function hydrateUnsafe(entry: Entry.Entry, query: DehydratedQuery) {
	const at = Option.match(Entry.peekUnsafe(entry), {
		onNone: () => undefined,
		onSome: Entry.updatedAt,
	});
	if (query.updatedAt > 0) {
		if (at === undefined || at < query.updatedAt) {
			Entry.setDataUnsafe(entry, query.data, query.updatedAt);
		}
	} else if (query.promise) {
		Entry.resumeUnsafe(entry, query.promise);
	}
}
