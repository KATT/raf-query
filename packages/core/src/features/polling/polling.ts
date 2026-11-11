import { type Part, part } from "../../client.ts";
import { type Entry, fetchEntry } from "../../entry.ts";
import { isNumber } from "../../guards.ts";
import { optionOf } from "../shared.ts";

/**
 * What `polling()` declares.
 *
 * @see https://raf-query.katt.dev/docs/polling
 */
export interface Polling {
	readonly options: {
		/** Refetch every `n` ms while the query is read. */
		readonly refetchInterval?: number | false;
	};
}

/**
 * Refetch read queries every `refetchInterval` ms.
 *
 * @see https://raf-query.katt.dev/docs/polling
 */
export function polling(): Part<Polling> {
	return part<Polling>({
		setup: (client, signal) => {
			const timers = new Map<Entry, unknown>();
			const stop = (entry: Entry) => {
				client.clock.clearTimeout(timers.get(entry));
				timers.delete(entry);
			};
			const sync = (entry: Entry) => {
				const interval = optionOf(entry, "refetchInterval");
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
		},
	});
}
