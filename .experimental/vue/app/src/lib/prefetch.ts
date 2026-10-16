import { type InjectionKey, inject, type Ref } from "vue";

import type { Prefetch } from "./settings.ts";

/** The settings bar's "Prefetch links" choice, which every `AppLink` follows. */
export const prefetchKey: InjectionKey<Ref<Prefetch>> =
	Symbol("prefetch links");

export function usePrefetchSetting(): Ref<Prefetch> {
	const setting = inject(prefetchKey);
	if (!setting) {
		throw new Error("usePrefetchSetting needs the app's settings");
	}
	return setting;
}
