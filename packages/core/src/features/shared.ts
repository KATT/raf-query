/** What the refetch features share: reading a `meta` field, and refetching read, stale queries. */
import type { QueryClient } from "../client.ts";
import { type Entry, fetchEntry, isEnabled, isStale } from "../entry.ts";
import { isObject } from "../guards.ts";

export function metaOf(entry: Entry, field: string): unknown {
	const meta = entry.options?.meta;
	if (!isObject(meta) || !(field in meta)) {
		return undefined;
	}
	// SAFETY: `field in meta` holds, so reading it is safe; its value is unknown.
	const fields = meta as Readonly<Record<string, unknown>>;
	return fields[field];
}

export function refetchStaleReads(client: QueryClient, optOut: string): void {
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
