/**
 * The search results the reader last opened, newest first, which the search
 * dialog lists before they type: by entry id (`caching#garbage-collection`),
 * in `localStorage`.
 */

const kept = 6;

const key = "raf-query-docs:recent-searches";

/** The ids stored as `raw`: anything else, or nothing, is none. */
export function parseRecent(raw: string | null): ReadonlyArray<string> {
	if (raw === null) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed
					.filter((id): id is string => typeof id === "string")
					.slice(0, kept)
			: [];
	} catch {
		return [];
	}
}

/** `ids` with `id` first, once, keeping the newest. */
export function withRecent(
	ids: ReadonlyArray<string>,
	id: string,
): ReadonlyArray<string> {
	return [id, ...ids.filter((one) => one !== id)].slice(0, kept);
}

// Storage throws where it's off (a private window, a sandboxed frame), and
// the dialog works without it.
export function readRecent(): ReadonlyArray<string> {
	try {
		return parseRecent(localStorage.getItem(key));
	} catch {
		return [];
	}
}

export function writeRecent(ids: ReadonlyArray<string>) {
	try {
		if (ids.length === 0) {
			localStorage.removeItem(key);
		} else {
			localStorage.setItem(key, JSON.stringify(ids));
		}
	} catch {
		// Not remembered, then.
	}
}

/** Puts `id` first in the stored list. */
export function rememberRecent(id: string) {
	writeRecent(withRecent(readRecent(), id));
}
