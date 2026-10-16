import { browser } from "$app/env";

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

export function writeCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function clearCookie(name: string) {
	document.cookie = `${name}=; path=/; max-age=0`;
}

/**
 * The page request in scope for the current `load`. Nested withRequest calls
 * stack. The browser leaves this unset and sends its own cookies.
 */
const requestStack: Array<Request> = [];

/**
 * Start a `load`'s queries with the page request's cookies in scope. The API
 * client reads its headers when each request starts, which is inside `run`.
 */
export function withRequest<T>(request: Request, run: () => T): T {
	requestStack.push(request);
	try {
		return run();
	} finally {
		requestStack.pop();
	}
}

/**
 * Headers for API calls. On the server, the page request's cookies (via
 * {@link withRequest}), so the API reads the same session as when the browser
 * calls it. The browser sends its own cookies.
 */
export function forwardedHeaders(): Record<string, string> {
	if (browser) {
		return {};
	}
	const cookie = requestStack.at(-1)?.headers.get("cookie");
	return cookie ? { cookie } : {};
}
