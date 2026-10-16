<!--
@component
An `<a>` that preloads its page the way the settings bar's "Prefetch links"
says: on hover or tap, once it scrolls into view, or as soon as it renders.
-->
<script lang="ts">
	import type { Attachment } from "svelte/attachments";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import { preloadData } from "$app/navigation";
	import { usePrefetchSetting } from "#lib/prefetch.svelte.ts";

	const {
		children,
		href,
		...rest
	}: HTMLAnchorAttributes & { readonly href: string } = $props();
	const prefetch = usePrefetchSetting();

	const preload: Attachment<HTMLAnchorElement> = (link) => {
		const target = href;
		switch (prefetch.current) {
			case "render":
				void preloadData(target);
				return;
			case "viewport": {
				const observer = new IntersectionObserver((entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						observer.disconnect();
						void preloadData(target);
					}
				});
				observer.observe(link);
				return () => {
					observer.disconnect();
				};
			}
			default:
				return;
		}
	};
</script>

<a
	{href}
	data-sveltekit-preload-data={prefetch.current === "intent" ? "hover" : "off"}
	{...rest}
	{@attach preload}
>
	{@render children?.()}
</a>
