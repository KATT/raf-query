import type { CoreOptions, QueryClient } from "@raf-query/react";
import { useSyncExternalStore } from "react";

import { type FakeServer, keyLabel, type NetworkRequest } from "./server.ts";

const tickers = new Map<
	number,
	{ now: number; subscribe: (onTick: () => void) => () => void }
>();

function tickerFor(interval: number) {
	let ticker = tickers.get(interval);
	if (!ticker) {
		const listeners = new Set<() => void>();
		let timer: ReturnType<typeof setInterval> | undefined;
		const created = {
			now: Date.now(),
			subscribe(onTick: () => void) {
				listeners.add(onTick);
				created.now = Date.now();
				timer ??= setInterval(() => {
					created.now = Date.now();
					for (const listener of listeners) {
						listener();
					}
				}, interval);
				return () => {
					listeners.delete(onTick);
					if (listeners.size === 0) {
						clearInterval(timer);
						timer = undefined;
					}
				};
			},
		};
		ticker = created;
		tickers.set(interval, ticker);
	}
	return ticker;
}

/** `Date.now()`, re-rendering every `interval` ms while mounted. */
export function useNow(interval: number) {
	const ticker = tickerFor(interval);
	return useSyncExternalStore(
		ticker.subscribe,
		() => ticker.now,
		() => 0,
	);
}

export function useRequests(
	server: FakeServer<unknown>,
): ReadonlyArray<NetworkRequest> {
	return useSyncExternalStore(
		server.subscribe,
		server.getRequests,
		server.getRequests,
	);
}

/** What an entry holds: nothing yet, a failure, or data within or past `staleTime`. */
export type DataStatus = "error" | "fresh" | "pending" | "stale";

export interface CacheRow {
	readonly data: DataStatus;
	/** The key's label, as the fake server logs it. */
	readonly hash: string;
	readonly isFetching: boolean;
	readonly readers: number;
	readonly updatedAt: number;
}

/** What `client.subscribe` reports an event about. */
type Entry = Parameters<Parameters<QueryClient["subscribe"]>[0]>[0]["entry"];

interface Tracked {
	/** Invalidated since its data was written. */
	invalidated: boolean;
	/** The state the last event saw. */
	state: Entry["state"];
}

function dataStatusOf(
	client: QueryClient,
	entry: Entry,
	tracked: Tracked,
): DataStatus {
	const state = entry.state;
	if (state.status === "error") {
		return "error";
	}
	if (!state.hasData) {
		return "pending";
	}
	const defaults: CoreOptions | undefined = client.config.defaults;
	const staleTime = entry.options?.staleTime ?? defaults?.staleTime ?? 0;
	return tracked.invalidated ||
		client.clock.now() - state.updatedAt >= staleTime
		? "stale"
		: "fresh";
}

function sameRows(a: ReadonlyArray<CacheRow>, b: ReadonlyArray<CacheRow>) {
	return (
		a.length === b.length &&
		a.every((row, index) => {
			const other = b[index];
			return (
				other !== undefined &&
				row.hash === other.hash &&
				row.data === other.data &&
				row.isFetching === other.isFetching &&
				row.readers === other.readers &&
				row.updatedAt === other.updatedAt
			);
		})
	);
}

interface CacheStore {
	readonly getSnapshot: () => ReadonlyArray<CacheRow>;
	readonly subscribe: (onChange: () => void) => () => void;
}

const cacheStores = new WeakMap<QueryClient, CacheStore>();

/**
 * Start recording `client`'s entries for {@link useCacheRows}. The cache only
 * reports entries as they're added, so call it before anything queries the
 * client.
 */
export function trackCache(client: QueryClient): void {
	if (cacheStores.has(client)) {
		return;
	}
	const entries = new Map<Entry, Tracked>();
	let rows: ReadonlyArray<CacheRow> = [];
	let scheduled = false;
	const listeners = new Set<() => void>();
	const rowsNow = () =>
		[...entries].map(([entry, tracked]) => ({
			data: dataStatusOf(client, entry, tracked),
			hash: keyLabel(entry.key),
			isFetching: entry.state.isFetching,
			readers: entry.readers.size,
			updatedAt: entry.state.updatedAt,
		}));
	const refresh = () => {
		const next = rowsNow();
		if (sameRows(rows, next)) {
			return;
		}
		rows = next;
		for (const listener of listeners) {
			listener();
		}
	};
	client.subscribe((event) => {
		const entry = event.entry;
		if (event.type === "removed") {
			entries.delete(entry);
		} else {
			const tracked = entries.get(entry);
			if (!tracked) {
				entries.set(entry, { invalidated: false, state: entry.state });
			} else if (event.type === "updated") {
				// An invalidation notifies an entry without changing its state.
				if (tracked.state === entry.state) {
					tracked.invalidated = true;
				} else if (tracked.state.updatedAt !== entry.state.updatedAt) {
					tracked.invalidated = false;
				}
				tracked.state = entry.state;
			}
		}
		// Cache events can fire while another component renders, so the rows
		// are refreshed in a microtask, once per batch.
		if (scheduled) {
			return;
		}
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			refresh();
		});
	});
	let timer: ReturnType<typeof setInterval> | undefined;
	cacheStores.set(client, {
		getSnapshot: () => rows,
		subscribe: (onChange) => {
			listeners.add(onChange);
			rows = rowsNow();
			// Staleness changes with time, not with a cache event.
			timer ??= setInterval(refresh, 250);
			return () => {
				listeners.delete(onChange);
				if (listeners.size === 0) {
					clearInterval(timer);
					timer = undefined;
				}
			};
		},
	});
}

/** Every entry of `client`'s cache, with its status kept current. */
export function useCacheRows(client: QueryClient): ReadonlyArray<CacheRow> {
	trackCache(client);
	const store = cacheStores.get(client);
	if (!store) {
		throw new Error("useCacheRows: trackCache didn't record the client");
	}
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	);
}
