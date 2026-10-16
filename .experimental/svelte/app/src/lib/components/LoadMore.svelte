<!--
@component
Infinite scroll: a "Load more" button that presses itself when it comes
within 300 px of the viewport. Unmount it while the page loads (and show
skeletons in its place); it watches again when it remounts, so it keeps
loading while it stays in reach.
-->
<script lang="ts">
	import { untrack } from "svelte";

	import { Button } from "#lib/components/ui/button/index.ts";

	const props: { readonly onload: () => void } = $props();
	let button = $state<HTMLElement | null>(null);

	$effect(() => {
		if (button === null) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					untrack(() => props.onload());
				}
			},
			{ rootMargin: "0px 0px 300px 0px" },
		);
		observer.observe(button);
		return () => {
			observer.disconnect();
		};
	});
</script>

<Button bind:ref={button} class="w-full" onclick={props.onload} variant="outline">
	Load more
</Button>
