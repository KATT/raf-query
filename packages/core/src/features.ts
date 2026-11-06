import { type Feature, feature, type QueryClient } from "./client.ts";
import { type Entry, fetchEntry, isEnabled, isStale } from "./entry.ts";
import { isNumber, isObject } from "./guards.ts";

function refetchStaleReads(client: QueryClient) {
	for (const entry of client["~entries"].values()) {
		if (entry.readers.size > 0 && isEnabled(entry) && isStale(entry)) {
			void fetchEntry(entry);
		}
	}
}

/** Refetch read, stale queries when the window regains focus. */
export function focusRefetch(): Feature {
	return (client, signal) => {
		const onFocus = () => {
			if (document.visibilityState === "visible") {
				refetchStaleReads(client);
			}
		};
		document.addEventListener("visibilitychange", onFocus, { signal });
		window.addEventListener("focus", onFocus, { signal });
	};
}

/** Refetch read, stale queries when the browser comes back online. */
export function reconnectRefetch(): Feature {
	return (client, signal) => {
		window.addEventListener("online", () => refetchStaleReads(client), {
			signal,
		});
	};
}

/** What `polling()` reads from a query's `meta`. */
export interface PollingMeta {
	/** Refetch every `n` ms while the query is read. */
	readonly refetchInterval?: number | false;
}

function intervalOf(entry: Entry): unknown {
	const meta = entry.options?.meta;
	return isObject(meta) && "refetchInterval" in meta
		? meta.refetchInterval
		: undefined;
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
			const interval = intervalOf(entry);
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
