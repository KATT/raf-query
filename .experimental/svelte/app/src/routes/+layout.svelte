<script lang="ts">
	import "../app.css";

	import { applyStaleTime, queryTimeDefaults } from "@examples/db/types";
	import { loaderVerbHint, loaderVerbOf } from "@examples/kit/lib/loader-verb";
	import { logoUrl } from "@examples/kit/lib/logo";
	import { QueryClient, setQueryClient } from "@raf-query/experimental-svelte";
	import { ModeWatcher } from "mode-watcher";

	import { navigating, page } from "$app/state";
	import AppLink from "#lib/components/AppLink.svelte";
	import NavigationProgress from "#lib/components/NavigationProgress.svelte";
	import Settings from "#lib/components/Settings.svelte";
	import { Toaster } from "#lib/components/ui/sonner/index.ts";
	import { PrefetchSetting, setPrefetchSetting } from "#lib/prefetch.svelte.ts";

	import type { LayoutProps } from "./$types";

	const props: LayoutProps = $props();
	// One client for the tab, or for one server render. The cache reads
	// `queryDefaults` live, and the settings bar changes it.
	// svelte-ignore state_referenced_locally
	const queryDefaults = queryTimeDefaults(props.data.staleTime);
	const queryClient = new QueryClient({ defaults: queryDefaults });
	// A server client leaves `gcTime` unset.
	if (!queryClient.isServer) {
		// svelte-ignore state_referenced_locally
		applyStaleTime(queryDefaults, props.data.staleTime);
	}
	setQueryClient(queryClient);
	// svelte-ignore state_referenced_locally
	setPrefetchSetting(new PrefetchSetting(props.data.prefetch));
	const verb = $derived(loaderVerbOf(page.url.pathname));
</script>

<svelte:head>
	<link href={logoUrl} rel="icon" type="image/svg+xml" />
</svelte:head>

<ModeWatcher darkClassNames={["dark"]} lightClassNames={["light"]} />
{#if navigating.to}
	<NavigationProgress />
{/if}
<header class="border-b">
	<div
		class="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-3 pb-2.5 sm:px-6 lg:flex-row lg:items-end lg:justify-between"
	>
		<div class="flex min-w-0 items-center gap-3 lg:pb-1">
			<AppLink class="flex shrink-0 items-center gap-2.5 font-semibold" href={`/${verb}/issues`}>
				<img alt="" class="size-6 shrink-0" data-slot="logo" height="32" src={logoUrl} width="32" />
				Issues
			</AppLink>
			<span class="truncate rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
				raf-query · SvelteKit
			</span>
		</div>
		<Settings
			latency={props.data.latency}
			{queryDefaults}
			staleTime={props.data.staleTime}
			{verb}
		/>
	</div>
	<div class="mx-auto max-w-5xl px-4 pb-2.5 sm:px-6">
		<p class="text-xs text-muted-foreground">
			<code class="font-mono font-medium text-foreground">{verb}</code>
			{loaderVerbHint("server", verb)}
		</p>
	</div>
</header>
<main class="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
	{@render props.children()}
</main>
<Toaster closeButton position="bottom-right" richColors />
