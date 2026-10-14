/** The settings menu's choices live in cookies, so the server renders them too. */
export const PREFETCH_COOKIE = "link-prefetch";

export const prefetchOptions = [
	{ label: "Default", value: "auto" },
	{ label: "In viewport", value: "viewport" },
	{ label: "On intent", value: "intent" },
	{ label: "Off", value: "off" },
] as const;
export type Prefetch = (typeof prefetchOptions)[number]["value"];

export function parsePrefetch(value: string | undefined): Prefetch {
	return (
		prefetchOptions.find((option) => option.value === value)?.value ?? "auto"
	);
}

export function writeCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}
