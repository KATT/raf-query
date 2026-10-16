<script setup lang="ts">
// Infinite scroll: a "Load more" button that presses itself when it comes
// within 300 px of the viewport. Unmount it while the page loads (and show
// skeletons in its place); it watches again when it remounts, so it keeps
// loading while it stays in reach.
import { onBeforeUnmount, onMounted, useTemplateRef } from "vue";

import { Button } from "@/components/ui/button";

const emit = defineEmits<{ load: [] }>();
const root = useTemplateRef<HTMLDivElement>("root");
let observer: IntersectionObserver | undefined;

onMounted(() => {
	if (!root.value) {
		return;
	}
	observer = new IntersectionObserver(
		(entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				observer?.disconnect();
				emit("load");
			}
		},
		{ rootMargin: "0px 0px 300px 0px" },
	);
	observer.observe(root.value);
});

onBeforeUnmount(() => {
	observer?.disconnect();
});
</script>

<template>
	<div ref="root">
		<Button class="w-full" variant="outline" @click="emit('load')">
			Load more
		</Button>
	</div>
</template>
