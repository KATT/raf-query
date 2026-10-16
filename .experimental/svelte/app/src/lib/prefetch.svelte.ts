import { getContext, setContext } from "svelte";

import type { Prefetch } from "./settings.ts";

const prefetchKey = Symbol("prefetch links");

/** The settings bar's "Prefetch links" choice, which every `AppLink` follows. */
export class PrefetchSetting {
	current: Prefetch = $state("off");

	constructor(initial: Prefetch) {
		this.current = initial;
	}
}

export function setPrefetchSetting(setting: PrefetchSetting) {
	setContext(prefetchKey, setting);
}

export function usePrefetchSetting(): PrefetchSetting {
	return getContext<PrefetchSetting>(prefetchKey);
}
