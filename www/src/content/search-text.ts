import { useSyncExternalStore } from "react";

import { noText, type SearchText } from "./search.ts";

let loaded: SearchText | undefined;
let loading: Promise<SearchText> | undefined;
const listeners = new Set<() => void>();

/**
 * Starts loading the docs' body text, once: when the search button is
 * hovered or focused, and when search opens. It's its own chunk, so pages
 * don't ship it. A failed load (a deploy since the page loaded) is tried
 * again next time; search finds names meanwhile.
 */
export function preloadSearchText(): Promise<SearchText> {
	loading ??= import("virtual:docs-search-text").then(
		(module) => {
			loaded = module.text;
			for (const listener of listeners) {
				listener();
			}
			return module.text;
		},
		() => {
			loading = undefined;
			return noText;
		},
	);
	return loading;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	void preloadSearchText();
	return () => {
		listeners.delete(listener);
	};
}

/**
 * The docs' body text, or `noText` until it has loaded. Hydration reads
 * `noText`, as the server rendered.
 */
export function useSearchText(): SearchText {
	return useSyncExternalStore(
		subscribe,
		() => loaded ?? noText,
		() => noText,
	);
}
