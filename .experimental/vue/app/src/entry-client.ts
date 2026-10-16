import "vue-sonner/style.css";
import "./app.css";

import { hydrate } from "@raf-query/experimental-vue";

import { createApp } from "./app.ts";
import { bootState } from "./boot.ts";
import { readSettings } from "./lib/settings.ts";

const page = createApp({
	initial: window.rafQueryBoot.load,
	isServer: false,
	settings: readSettings(document.cookie),
});
const mounted = Promise.withResolvers<void>();
hydrate(page.queryClient, bootState(mounted.promise));
await page.router.isReady();
page.app.mount("#app");
mounted.resolve();
