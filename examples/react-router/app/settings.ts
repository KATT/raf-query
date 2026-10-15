import {
	LATENCY_COOKIE,
	LATENCY_HEADER,
	parseLatency,
	parseStaleTime,
	STALE_TIME_COOKIE,
} from "@examples/db/types";

/** The settings menu's choices live in cookies, so the server renders them too. */
export const PREFETCH_COOKIE = "link-prefetch";

export const prefetchOptions = [
	{ label: "Off", value: "none" },
	{ label: "On intent", value: "intent" },
	{ label: "On render", value: "render" },
	{ label: "On viewport", value: "viewport" },
] as const;
export type Prefetch = (typeof prefetchOptions)[number]["value"];
export const DEFAULT_PREFETCH: Prefetch = "none";

/**
 * The request in scope for the current loader. Nested withRequest calls stack.
 * Client navigations leave this unset and read document.cookie instead.
 */
const requestStack: Array<Request> = [];

/** Run a loader (and its queryFns) with the request's cookies in scope. */
export function withRequest<T>(request: Request, run: () => T): T {
	requestStack.push(request);
	try {
		return run();
	} finally {
		requestStack.pop();
	}
}

function parseCookieHeader(header: string | null) {
	return Object.fromEntries(
		(header ?? "")
			.split("; ")
			.filter(Boolean)
			.map((cookie) => cookie.split("=", 2)),
	);
}

/** The request's cookies on the server, the document's in the browser. */
export function readCookies() {
	const request = requestStack.at(-1);
	if (request) {
		return parseCookieHeader(request.headers.get("cookie"));
	}
	if (import.meta.env.SSR) {
		return {};
	}
	return parseCookieHeader(document.cookie);
}

export function writeCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function clearCookie(name: string) {
	document.cookie = `${name}=; path=/; max-age=0`;
}

export function parsePrefetch(value: string | undefined): Prefetch {
	return (
		prefetchOptions.find((option) => option.value === value)?.value ??
		DEFAULT_PREFETCH
	);
}

export function readPrefetch() {
	return parsePrefetch(readCookies()[PREFETCH_COOKIE]);
}

/** The chosen latency, or `undefined` for the server's default. */
export function readLatency() {
	return parseLatency(readCookies()[LATENCY_COOKIE]);
}

/** The chosen stale time, or `undefined` for the app's default. */
export function readStaleTime() {
	return parseStaleTime(readCookies()[STALE_TIME_COOKIE]);
}

/**
 * Sends the chosen latency with each API request. Loaders call the API on the
 * server during SSR and in the browser after, and both read the cookie.
 */
export function latencyHeaders(): Record<string, string> {
	const latency = readLatency();
	return latency === undefined ? {} : { [LATENCY_HEADER]: String(latency) };
}
