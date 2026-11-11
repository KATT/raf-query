/** What the refetch features share: reading an option they declare, and refetching read, stale queries. */
import type { QueryClient } from "../client.ts";
import { type Entry, fetchEntry, isStale } from "../entry.ts";
import { isObject } from "../guards.ts";

/** An option a plugin declares, for the entry: the query's, or else the client's default. */
export function optionOf(entry: Entry, name: string): unknown {
	for (const options of [entry.options, entry.client.config.defaults]) {
		if (isObject(options) && name in options) {
			// SAFETY: `name in options` holds, so reading it is safe; its value is unknown.
			const fields = options as Readonly<Record<string, unknown>>;
			if (fields[name] !== undefined) {
				return fields[name];
			}
		}
	}
	return undefined;
}

export function refetchStaleReads(client: QueryClient, optOut: string): void {
	for (const entry of client["~entries"].values()) {
		if (
			entry.readers.size > 0 &&
			isStale(entry) &&
			optionOf(entry, optOut) !== false
		) {
			void fetchEntry(entry);
		}
	}
}
