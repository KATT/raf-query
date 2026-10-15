import { useSyncExternalStore } from "react";

import { defaultFrameworkMode, type FrameworkMode } from "./framework-mode.ts";

/**
 * Homepage framework mode from `?mode=`. Static prerender always ships the
 * default (TanStack Start) HTML for `/`, so hydration must match that;
 * afterward (and on later URL changes) it follows the search.
 */
export function useFrameworkMode(modeFromUrl: FrameworkMode): FrameworkMode {
	return useSyncExternalStore(
		() => () => {},
		() => modeFromUrl,
		() => defaultFrameworkMode,
	);
}
