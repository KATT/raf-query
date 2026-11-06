import { type Feature, feature, type QueryClient } from "./client.ts";
import { type Entry, fetchEntry, isEnabled, isStale } from "./entry.ts";
import { isNumber, isObject } from "./guards.ts";

function metaOf(entry: Entry, field: string): unknown {
	const meta = entry.options?.meta;
	if (!isObject(meta) || !(field in meta)) {
		return undefined;
	}
	// SAFETY: `field in meta` holds, so reading it is safe; its value is unknown.
	const fields = meta as Readonly<Record<string, unknown>>;
	return fields[field];
}

function refetchStaleReads(client: QueryClient, optOut: string) {
	for (const entry of client["~entries"].values()) {
		if (
			entry.readers.size > 0 &&
			isEnabled(entry) &&
			isStale(entry) &&
			metaOf(entry, optOut) !== false
		) {
			void fetchEntry(entry);
		}
	}
}

/** What `focusRefetch()` reads from a query's `meta`. */
export interface FocusRefetchMeta {
	/** `false`: don't refetch this query on focus. */
	readonly refetchOnWindowFocus?: boolean;
}

/**
 * Refetch read, stale queries when the window regains focus, except those
 * with `meta: { refetchOnWindowFocus: false }`.
 */
export function focusRefetch(): Feature<{ readonly meta: FocusRefetchMeta }> {
	return feature<{ readonly meta: FocusRefetchMeta }>((client, signal) => {
		const onFocus = () => {
			if (document.visibilityState === "visible") {
				refetchStaleReads(client, "refetchOnWindowFocus");
			}
		};
		document.addEventListener("visibilitychange", onFocus, { signal });
		window.addEventListener("focus", onFocus, { signal });
	});
}

/** What `reconnectRefetch()` reads from a query's `meta`. */
export interface ReconnectRefetchMeta {
	/** `false`: don't refetch this query when the browser comes back online. */
	readonly refetchOnReconnect?: boolean;
}

/**
 * Refetch read, stale queries when the browser comes back online, except
 * those with `meta: { refetchOnReconnect: false }`.
 */
export function reconnectRefetch(): Feature<{
	readonly meta: ReconnectRefetchMeta;
}> {
	return feature<{ readonly meta: ReconnectRefetchMeta }>((client, signal) => {
		window.addEventListener(
			"online",
			() => refetchStaleReads(client, "refetchOnReconnect"),
			{ signal },
		);
	});
}

/** What `polling()` reads from a query's `meta`. */
export interface PollingMeta {
	/** Refetch every `n` ms while the query is read. */
	readonly refetchInterval?: number | false;
}

/** Refetch read queries every `meta.refetchInterval` ms. */
export function polling(): Feature<{ readonly meta: PollingMeta }> {
	return feature<{ readonly meta: PollingMeta }>((client, signal) => {
		const timers = new Map<Entry, unknown>();
		const stop = (entry: Entry) => {
			client.clock.clearTimeout(timers.get(entry));
			timers.delete(entry);
		};
		const sync = (entry: Entry) => {
			const interval = metaOf(entry, "refetchInterval");
			const wanted =
				entry.readers.size > 0 &&
				isNumber(interval) &&
				interval > 0 &&
				client["~entries"].get(entry.hash) === entry;
			if (!wanted) {
				stop(entry);
			} else if (!timers.has(entry)) {
				const tick = () => {
					timers.set(entry, client.clock.setTimeout(tick, interval));
					void fetchEntry(entry);
				};
				timers.set(entry, client.clock.setTimeout(tick, interval));
			}
		};
		client.subscribe(
			(event) => {
				if (event.type === "readers" || event.type === "removed") {
					sync(event.entry);
				}
			},
			{ signal },
		);
		for (const entry of client["~entries"].values()) {
			sync(entry);
		}
		signal.addEventListener("abort", () => {
			for (const entry of timers.keys()) {
				stop(entry);
			}
		});
	});
}
