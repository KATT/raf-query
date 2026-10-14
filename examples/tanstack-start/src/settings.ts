import { LATENCY_COOKIE, parseLatency } from "@examples/db/types";
import type { AnyRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/** The settings menu's choices live in cookies, so the server renders them too. */
export const PREFETCH_COOKIE = "link-prefetch";

export const prefetchOptions = [
	{ label: "On intent", value: "intent" },
	{ label: "In viewport", value: "viewport" },
	{ label: "On render", value: "render" },
	{ label: "Off", value: "off" },
] as const;
export type Prefetch = (typeof prefetchOptions)[number]["value"];

export const readCookie = createIsomorphicFn()
	.server((name: string) => getCookie(name))
	.client(
		(name: string) =>
			document.cookie
				.split("; ")
				.find((cookie) => cookie.startsWith(`${name}=`))
				?.slice(name.length + 1),
	);

export function writeCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function readPrefetch(): Prefetch {
	const value = readCookie(PREFETCH_COOKIE);
	return prefetchOptions.find((option) => option.value === value)?.value ??
		"intent";
}

export function readLatency() {
	return parseLatency(readCookie(LATENCY_COOKIE)) ?? 400;
}

/** `Link` reads it while rendering, so links pick it up when they next render. */
export function toDefaultPreload(
	prefetch: Prefetch,
): AnyRouter["options"]["defaultPreload"] {
	return prefetch === "off" ? false : prefetch;
}
