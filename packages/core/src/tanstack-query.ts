/**
 * Two-way cache sync with TanStack Query, for apps that move one screen at
 * a time. Opt-in: nothing else in the package imports this module, and it
 * depends on no `@tanstack/*` package. It's typed against the small part
 * of TanStack Query's `QueryClient` it uses.
 */
import { type Feature, feature } from "./client.ts";
import {
	type Entry,
	entryForKey,
	failWith,
	invalidate,
	isEnabled,
	remove,
	reset,
	write,
} from "./entry.ts";
import { isFailValue, isQueryFailure, QueryFailure } from "./fail.ts";
import { hashKey, type QueryKey } from "./keys/keys.ts";
import { entryStamp, matches } from "./keys/targets.ts";

/** The state of a TanStack Query query that the sync reads. */
export interface QueryStateLike {
	readonly data: unknown;
	readonly dataUpdatedAt: number;
	readonly error: unknown;
	readonly status: string;
}

/** A TanStack Query `Query`, as far as the sync uses it. */
export interface QueryLike {
	getObserversCount(): number;
	isActive(): boolean;
	readonly queryKey: QueryKey;
	setState(state: {
		readonly error?: unknown;
		readonly errorUpdatedAt?: number;
		readonly status?: string;
	}): void;
	readonly state: QueryStateLike;
}

/** An event from TanStack Query's `QueryCache.subscribe`. */
export interface QueryCacheEventLike {
	readonly action?: { readonly type: string };
	readonly query: QueryLike;
	readonly type: string;
}

/** A TanStack Query `QueryCache`, as far as the sync uses it. */
export interface QueryCacheLike {
	getAll(): ReadonlyArray<QueryLike>;
	remove(query: QueryLike): void;
	subscribe(listener: (event: QueryCacheEventLike) => void): () => void;
}

/** A TanStack Query `QueryClient`, as far as the sync uses it. */
export interface QueryClientLike {
	getQueryCache(): QueryCacheLike;
	invalidateQueries(filters: {
		readonly exact: true;
		readonly queryKey: QueryKey;
		readonly refetchType: "active" | "none";
	}): Promise<void>;
	resetQueries(filters: {
		readonly exact: true;
		readonly queryKey: QueryKey;
	}): Promise<void>;
	setQueryData(
		queryKey: QueryKey,
		updater: () => unknown,
		options: { readonly updatedAt: number },
	): unknown;
}

export interface TanStackQuerySyncOptions {
	/** Which keys to mirror. Default: every key. */
	readonly filter?: (queryKey: QueryKey) => boolean;
}

/** One side of a query, as the sync last left it. */
interface Side {
	readonly data: unknown;
	readonly error: unknown;
	readonly hasData: boolean;
	readonly updatedAt: number;
}

interface Link {
	raf?: Side;
	/** The newest raf invalidation already passed on. */
	stamp: number;
	tanstack?: Side;
}

function rafSide(entry: Entry): Side {
	const state = entry.state;
	return {
		data: state.data,
		error: state.status === "error" ? state.error : undefined,
		hasData: state.hasData,
		updatedAt: state.updatedAt,
	};
}

function tanstackSide(query: QueryLike): Side {
	const state = query.state;
	return {
		data: state.data,
		error: state.status === "error" ? state.error : undefined,
		hasData: state.data !== undefined,
		updatedAt: state.dataUpdatedAt,
	};
}

function newData(now: Side | undefined, before: Side | undefined): boolean {
	return (
		now !== undefined &&
		now.hasData &&
		(before?.hasData !== true ||
			now.data !== before.data ||
			now.updatedAt !== before.updatedAt)
	);
}

function newError(now: Side | undefined, before: Side | undefined): boolean {
	return now?.error !== undefined && now.error !== before?.error;
}

function lostData(now: Side | undefined, before: Side | undefined): boolean {
	return now !== undefined && !now.hasData && before?.hasData === true;
}

/** The newest invalidation that covers the entry's data, or `0`. */
function latestStamp(entry: Entry): number {
	let latest = 0;
	for (const stamp of entry.client["~stamps"]) {
		if (
			stamp.at > entry.requestedAt &&
			stamp.at > latest &&
			matches(entry, stamp)
		) {
			latest = stamp.at;
		}
	}
	return latest;
}

/** Whether raf refetches the entry when it's invalidated: it's read and has options. */
function refetchesOnInvalidate(entry: Entry): boolean {
	return (
		entry.readers.size > 0 && entry.options !== undefined && isEnabled(entry)
	);
}

function errorToRaf(entry: Entry, error: unknown) {
	failWith(entry, isQueryFailure(error) ? error.fail : error);
}

/**
 * Mirror this client's cache and a TanStack Query `QueryClient`'s into each
 * other, by key hash, while the client is mounted: data, errors,
 * invalidations, resets and removals. A screen on raf-query and a screen on
 * TanStack Query that use the same `queryKey` read the same data.
 *
 * ```ts
 * const queryClient = new QueryClient();
 * export const makeQueryClient = () =>
 *   createQueryClient({ features: [tanstackQuerySync(queryClient)] });
 * ```
 *
 * Each cache still runs its own requests: an in-flight request, retries
 * and `isFetching` stay on the side that started them.
 */
export function tanstackQuerySync(
	queryClient: QueryClientLike,
	options: TanStackQuerySyncOptions = {},
): Feature {
	return feature((client, signal) => {
		const cache = queryClient.getQueryCache();
		const filter = options.filter ?? (() => true);
		const queries = new Map<string, QueryLike>();
		const links = new Map<string, Link>();
		/** Keys whose raf entry or TanStack query the sync created: removing a mirror doesn't remove the original. */
		const rafMirrors = new Set<string>();
		const tanstackMirrors = new Set<string>();
		/** Set while the sync writes to either cache, so its own writes don't echo back. */
		let applying = false;

		const apply = (run: () => void) => {
			applying = true;
			try {
				run();
			} finally {
				applying = false;
			}
		};

		const toTanStack = (hash: string, entry: Entry) => {
			const query = queries.get(hash);
			const data = entry.state.data;
			queryClient.setQueryData(query?.queryKey ?? entry.key, () => data, {
				updatedAt: entry.state.updatedAt,
			});
			if (!query && queries.has(hash)) {
				tanstackMirrors.add(hash);
			}
		};

		const toRaf = (hash: string, query: QueryLike) => {
			if (!client["~entries"].has(hash)) {
				rafMirrors.add(hash);
			}
			const entry = entryForKey(client, query.queryKey);
			write(
				entry,
				query.state.data,
				query.state.dataUpdatedAt,
				++client["~seq"],
			);
		};

		const errorToTanStack = (
			hash: string,
			query: QueryLike,
			error: unknown,
		) => {
			query.setState({
				error: isFailValue(error) ? new QueryFailure(error, hash) : error,
				errorUpdatedAt: client.clock.now(),
				status: "error",
			});
		};

		const linkOf = (hash: string) => {
			const link = links.get(hash) ?? { stamp: 0 };
			links.set(hash, link);
			return link;
		};

		const reconcile = (hash: string) => {
			const link = linkOf(hash);
			const entry = client["~entries"].get(hash);
			const query = queries.get(hash);
			const raf = entry && rafSide(entry);
			const tanstack = query && tanstackSide(query);
			let stamp = link.stamp;
			apply(() => {
				const rafData = newData(raf, link.raf);
				const tanstackData = newData(tanstack, link.tanstack);
				if (
					entry &&
					rafData &&
					!(
						tanstackData &&
						tanstack &&
						tanstack.updatedAt > entry.state.updatedAt
					)
				) {
					toTanStack(hash, entry);
				} else if (query && tanstackData) {
					toRaf(hash, query);
				} else if (query && lostData(raf, link.raf) && tanstack?.hasData) {
					void queryClient.resetQueries({
						exact: true,
						queryKey: query.queryKey,
					});
				} else if (entry && lostData(tanstack, link.tanstack) && raf?.hasData) {
					void reset(entry);
				}
				if (query && newError(raf, link.raf)) {
					errorToTanStack(hash, query, raf?.error);
				} else if (entry && newError(tanstack, link.tanstack)) {
					errorToRaf(entry, tanstack?.error);
				}
				const current = client["~entries"].get(hash);
				if (current) {
					const latest = latestStamp(current);
					const target = queries.get(hash);
					if (latest > stamp && target) {
						void queryClient.invalidateQueries({
							exact: true,
							queryKey: target.queryKey,
							refetchType: refetchesOnInvalidate(current) ? "none" : "active",
						});
					}
					stamp = Math.max(stamp, latest);
				}
			});
			const entryNow = client["~entries"].get(hash);
			const queryNow = queries.get(hash);
			link.raf = entryNow && rafSide(entryNow);
			link.tanstack = queryNow && tanstackSide(queryNow);
			link.stamp = stamp;
		};

		const invalidateInRaf = (hash: string, query: QueryLike) => {
			const entry = client["~entries"].get(hash);
			if (!entry) {
				return;
			}
			if (query.isActive()) {
				client["~stamps"].push(entryStamp(hash, ++client["~seq"]));
			} else {
				void invalidate(client, (at) => [entryStamp(hash, at)]);
			}
			linkOf(hash).stamp = client["~seq"];
		};

		const forget = (hash: string) => {
			links.delete(hash);
		};

		const onTanStack = (event: QueryCacheEventLike) => {
			const query = event.query;
			if (!filter(query.queryKey)) {
				return;
			}
			const hash = hashKey(query.queryKey);
			if (event.type === "removed") {
				queries.delete(hash);
				forget(hash);
				const mirror = tanstackMirrors.delete(hash);
				const entry = client["~entries"].get(hash);
				if (!applying && !mirror && entry && entry.readers.size === 0) {
					apply(() => remove(entry));
				}
				return;
			}
			if (event.type === "added") {
				queries.set(hash, query);
			}
			if (applying) {
				return;
			}
			const action = event.action?.type;
			if (action === "invalidate") {
				invalidateInRaf(hash, query);
			} else if (
				event.type === "added" ||
				action === "success" ||
				action === "error" ||
				action === "setState"
			) {
				reconcile(hash);
			}
		};

		const onRaf = (entry: Entry, type: string) => {
			if (!filter(entry.key)) {
				return;
			}
			const hash = entry.hash;
			if (type === "removed") {
				forget(hash);
				const mirror = rafMirrors.delete(hash);
				const query = queries.get(hash);
				if (!applying && !mirror && query && query.getObserversCount() === 0) {
					apply(() => cache.remove(query));
				}
				return;
			}
			const current = client["~entries"].get(hash) === entry;
			if (current && !applying && type !== "readers") {
				reconcile(hash);
			}
		};

		for (const query of cache.getAll()) {
			if (filter(query.queryKey)) {
				queries.set(hashKey(query.queryKey), query);
			}
		}
		const unsubscribe = cache.subscribe(onTanStack);
		signal.addEventListener("abort", unsubscribe, { once: true });
		client.subscribe((event) => onRaf(event.entry, event.type), { signal });
		const hashes = new Set(queries.keys());
		for (const entry of client["~entries"].values()) {
			if (filter(entry.key)) {
				hashes.add(entry.hash);
			}
		}
		for (const hash of hashes) {
			reconcile(hash);
		}
	});
}
