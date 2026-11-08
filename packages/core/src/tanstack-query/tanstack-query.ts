/**
 * Two-way cache sync with TanStack Query, for apps that move one screen at
 * a time. Opt-in: nothing else in the package imports this module, and it
 * depends on no `@tanstack/*` package. It's typed against the small part
 * of TanStack Query's `QueryClient` it uses.
 */
import { type Feature, feature } from "../client.ts";
import {
	type Entry,
	entryForKey,
	failWith,
	invalidate,
	remove,
	reset,
	write,
} from "../entry.ts";
import { hashKey, type QueryKey } from "../keys/keys.ts";
import { entryStamp, matches } from "../keys/targets.ts";

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
	raf?: Side | undefined;
	/** The newest raf invalidation already passed on. */
	stamp: number;
	tanstack?: Side | undefined;
}

function sideOf(
	state: {
		readonly data: unknown;
		readonly error: unknown;
		readonly status: string;
	},
	hasData: boolean,
	updatedAt: number,
): Side {
	const error = state.status === "error" ? state.error : undefined;
	return { data: state.data, error, hasData, updatedAt };
}

const rafSide = (entry: Entry | undefined) =>
	entry && sideOf(entry.state, entry.state.hasData, entry.state.updatedAt);

const tanstackSide = (query: QueryLike | undefined) =>
	query &&
	sideOf(
		query.state,
		query.state.data !== undefined,
		query.state.dataUpdatedAt,
	);

const newData = (now?: Side, before?: Side): now is Side =>
	now?.hasData === true &&
	(before?.hasData !== true ||
		now.data !== before.data ||
		now.updatedAt !== before.updatedAt);

const newError = (now?: Side, before?: Side) =>
	now?.error !== undefined && now.error !== before?.error;

const lostData = (now?: Side, before?: Side) =>
	now?.hasData === false && before?.hasData === true;

/** The newest invalidation that covers the entry's data, or `0`. */
function latestStamp(entry: Entry): number {
	let latest = 0;
	for (const stamp of entry.client["~stamps"]) {
		if (
			stamp.at > Math.max(entry.requestedAt, latest) &&
			matches(entry, stamp)
		) {
			latest = stamp.at;
		}
	}
	return latest;
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
		const entries = client["~entries"];
		const queries = new Map<string, QueryLike>();
		const links = new Map<string, Link>();
		/** Entries and queries the sync created. Removing one doesn't remove its original. */
		const mirrors = new WeakSet<object>();
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

		const linkOf = (hash: string) => {
			const link = links.get(hash) ?? { stamp: 0 };
			links.set(hash, link);
			return link;
		};

		const reconcile = (hash: string) => {
			const link = linkOf(hash);
			const entry = entries.get(hash);
			const query = queries.get(hash);
			const raf = rafSide(entry);
			const tanstack = tanstackSide(query);
			apply(() => {
				const tanstackData = newData(tanstack, link.tanstack);
				if (
					entry &&
					newData(raf, link.raf) &&
					!(tanstackData && tanstack.updatedAt > entry.state.updatedAt)
				) {
					const data = entry.state.data;
					queryClient.setQueryData(query?.queryKey ?? entry.key, () => data, {
						updatedAt: entry.state.updatedAt,
					});
					const created = queries.get(hash);
					if (!query && created) {
						mirrors.add(created);
					}
				} else if (query && tanstackData) {
					const existed = entries.has(hash);
					const target = entryForKey(client, query.queryKey);
					if (!existed) {
						mirrors.add(target);
					}
					write(
						target,
						query.state.data,
						query.state.dataUpdatedAt,
						++client["~seq"],
					);
				} else if (query && lostData(raf, link.raf) && tanstack?.hasData) {
					void queryClient.resetQueries({
						exact: true,
						queryKey: query.queryKey,
					});
				} else if (entry && lostData(tanstack, link.tanstack) && raf?.hasData) {
					void reset(entry);
				}
				if (query && newError(raf, link.raf)) {
					query.setState({
						error: raf?.error,
						errorUpdatedAt: client.clock.now(),
						status: "error",
					});
				} else if (entry && newError(tanstack, link.tanstack)) {
					failWith(entry, tanstack?.error);
				}
				const current = entries.get(hash);
				const target = queries.get(hash);
				const latest = current ? latestStamp(current) : 0;
				if (current && target && latest > link.stamp) {
					// Raf refetches a read entry that has options. Without options
					// `fetchEntry` does not run, so TanStack refetches if it has an observer.
					const refetches = current.readers.size > 0 && current.options;
					void queryClient.invalidateQueries({
						exact: true,
						queryKey: target.queryKey,
						refetchType: refetches ? "none" : "active",
					});
				}
				link.stamp = Math.max(link.stamp, latest);
			});
			link.raf = rafSide(entries.get(hash));
			link.tanstack = tanstackSide(queries.get(hash));
		};

		cache.getAll().forEach((query) => {
			if (filter(query.queryKey)) {
				queries.set(hashKey(query.queryKey), query);
			}
		});
		const unsubscribe = cache.subscribe((event) => {
			const query = event.query;
			if (!filter(query.queryKey)) {
				return;
			}
			const hash = hashKey(query.queryKey);
			const action = event.action?.type;
			if (event.type === "removed") {
				queries.delete(hash);
				links.delete(hash);
				const entry = entries.get(hash);
				if (!applying && !mirrors.has(query) && entry?.readers.size === 0) {
					apply(() => remove(entry));
				}
			} else if (event.type === "added") {
				queries.set(hash, query);
			}
			if (applying || event.type === "removed") {
				return;
			}
			if (action === "invalidate") {
				if (query.isActive()) {
					client["~stamps"].push(entryStamp(hash, ++client["~seq"]));
				} else {
					void invalidate(client, (at) => [entryStamp(hash, at)]);
				}
				linkOf(hash).stamp = client["~seq"];
			} else if (
				event.type === "added" ||
				action === "success" ||
				action === "error" ||
				action === "setState"
			) {
				reconcile(hash);
			}
		});
		signal.addEventListener("abort", unsubscribe, { once: true });
		client.subscribe(
			(event) => {
				const entry = event.entry;
				const hash = entry.hash;
				if (!filter(entry.key)) {
					return;
				}
				if (event.type === "removed") {
					links.delete(hash);
					const query = queries.get(hash);
					if (
						!applying &&
						!mirrors.has(entry) &&
						query?.getObserversCount() === 0
					) {
						apply(() => cache.remove(query));
					}
				} else if (
					!applying &&
					event.type !== "readers" &&
					entries.get(hash) === entry
				) {
					reconcile(hash);
				}
			},
			{ signal },
		);
		queries.forEach((_query, hash) => reconcile(hash));
		entries.forEach((entry) => {
			if (filter(entry.key)) {
				reconcile(entry.hash);
			}
		});
	});
}
