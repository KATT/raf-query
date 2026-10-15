import { useEffect, useState } from "react";

import {
	defaultFrameworkMode,
	type FrameworkMode,
} from "./framework-mode.ts";

/**
 * Homepage framework mode from `?mode=`. Static prerender always ships the
 * default (TanStack Start) HTML for `/`, so the first client render must
 * match that; after mount (and on later URL changes) it follows the search.
 */
export function useFrameworkMode(modeFromUrl: FrameworkMode): FrameworkMode {
	const [mode, setMode] = useState(defaultFrameworkMode);
	useEffect(() => {
		setMode(modeFromUrl);
	}, [modeFromUrl]);
	return mode;
}
