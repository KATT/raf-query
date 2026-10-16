<script setup lang="ts">
// An `<a>` that loads its page's queries the way the settings bar's
// "Prefetch links" says: on hover, focus or tap, once it scrolls into view,
// or as soon as it renders.
import { useQueryClient } from "@raf-query/experimental-vue";
import { toRef, useTemplateRef, watch } from "vue";
import { useLink, useRouter } from "vue-router";

import { usePrefetchSetting } from "@/lib/prefetch.ts";
import { prefetchPage } from "@/router.ts";

const props = defineProps<{ readonly href: string }>();
const link = useLink({ to: toRef(props, "href") });
const router = useRouter();
const queryClient = useQueryClient();
const prefetch = usePrefetchSetting();
const anchor = useTemplateRef<HTMLAnchorElement>("anchor");

function preload() {
	prefetchPage(router, queryClient, props.href);
}

function onIntent() {
	if (prefetch.value === "intent") {
		preload();
	}
}

watch(
	[prefetch, () => props.href, anchor],
	([mode, , element], _previous, onCleanup) => {
		if (!element) {
			return;
		}
		if (mode === "render") {
			preload();
		}
		if (mode === "viewport") {
			const observer = new IntersectionObserver((entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					preload();
				}
			});
			observer.observe(element);
			onCleanup(() => {
				observer.disconnect();
			});
		}
	},
	{ flush: "post", immediate: true },
);
</script>

<template>
	<a
		ref="anchor"
		:href="link.href.value"
		@click="link.navigate"
		@focus="onIntent"
		@mouseenter="onIntent"
		@touchstart.passive="onIntent"
	>
		<slot />
	</a>
</template>
