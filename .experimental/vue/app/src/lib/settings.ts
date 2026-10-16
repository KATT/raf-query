import {
	DEFAULT_LATENCY_MS,
	DEFAULT_STALE_TIME,
	LATENCY_COOKIE,
	parseLatency,
	parseStaleTime,
	STALE_TIME_COOKIE,
} from "@examples/db/types";

/** The settings menu's choices live in cookies, so the server renders them too. */
export const PREFETCH_COOKIE = "link-prefetch";

export const prefetchOptions = [
	{ label: "Off", value: "off" },
	{ label: "On intent", value: "intent" },
	{ label: "In viewport", value: "viewport" },
	{ label: "On render", value: "render" },
] as const;
export type Prefetch = (typeof prefetchOptions)[number]["value"];
export const DEFAULT_PREFETCH: Prefetch = "off";

export function parsePrefetch(value: string | undefined): Prefetch {
	return (
		prefetchOptions.find((option) => option.value === value)?.value ??
		DEFAULT_PREFETCH
	);
}

export interface Settings {
	readonly latency: number;
	readonly prefetch: Prefetch;
	readonly staleTime: number;
}

/** The settings bar's choices from a `cookie` header or `document.cookie`. */
export function readSettings(cookie: string): Settings {
	const cookies = new Map(
		cookie
			.split(";")
			.map((part) => part.trim().split("="))
			.map(([name = "", ...value]) => [
				name,
				decodeURIComponent(value.join("=")),
			]),
	);
	return {
		latency: parseLatency(cookies.get(LATENCY_COOKIE)) ?? DEFAULT_LATENCY_MS,
		prefetch: parsePrefetch(cookies.get(PREFETCH_COOKIE)),
		staleTime:
			parseStaleTime(cookies.get(STALE_TIME_COOKIE)) ?? DEFAULT_STALE_TIME,
	};
}

export function writeCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function clearCookie(name: string) {
	document.cookie = `${name}=; path=/; max-age=0`;
}

let requestHeaders: () => Record<string, string> = () => ({});

/**
 * Where the server render finds the page request's headers. The browser
 * leaves it unset and sends its own cookies.
 */
export function setRequestHeaders(read: () => Record<string, string>) {
	requestHeaders = read;
}

/**
 * Headers for API calls. On the server, the page request's cookies, so the
 * API reads the same session as when the browser calls it.
 */
export function forwardedHeaders(): Record<string, string> {
	return requestHeaders();
}
