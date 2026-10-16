<!--
@component
The top bar's settings: the loader verb, link prefetching, stale time,
latency, and Reset. Each choice but the verb lives in a cookie.
-->
<script lang="ts">
	import {
		applyStaleTime,
		DEFAULT_LATENCY_MS,
		DEFAULT_STALE_TIME,
		LATENCY_COOKIE,
		latencyOptions,
		LoaderVerb,
		loaderVerbs,
		parseLatency,
		parseStaleTime,
		type QueryTimeDefaults,
		STALE_TIME_COOKIE,
		staleTimeOptions,
	} from "@examples/db/types";
	import { withLoaderVerb } from "@examples/kit/lib/loader-verb";
	import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
	import { useQueryClient } from "@raf-query/experimental-svelte";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { Button } from "#lib/components/ui/button/index.ts";
	import {
		NativeSelect,
		NativeSelectOption,
	} from "#lib/components/ui/native-select/index.ts";
	import { usePrefetchSetting } from "#lib/prefetch.svelte.ts";
	import {
		clearCookie,
		DEFAULT_PREFETCH,
		parsePrefetch,
		PREFETCH_COOKIE,
		prefetchOptions,
		writeCookie,
	} from "#lib/settings.ts";

	const props: {
		readonly latency: number;
		readonly queryDefaults: QueryTimeDefaults;
		readonly staleTime: number;
		readonly verb: LoaderVerb;
	} = $props();
	const queryClient = useQueryClient();
	const prefetch = usePrefetchSetting();
	// svelte-ignore state_referenced_locally
	let latency = $state(props.latency);
	// svelte-ignore state_referenced_locally
	let staleTime = $state(props.staleTime);

	const settings = $derived([
		{
			label: "Loader",
			onchange: (value: string) => {
				const verb = LoaderVerb.safeParse(value);
				if (verb.success) {
					void goto(withLoaderVerb(page.url, verb.data));
				}
			},
			options: loaderVerbs.map((verb) => ({ label: verb, value: verb })),
			value: props.verb,
		},
		{
			label: "Prefetch links",
			onchange: (value: string) => {
				const next = parsePrefetch(value);
				writeCookie(PREFETCH_COOKIE, next);
				prefetch.current = next;
			},
			options: prefetchOptions,
			value: prefetch.current,
		},
		{
			label: "Stale time",
			onchange: (value: string) => {
				const next = parseStaleTime(value);
				if (next === undefined) {
					return;
				}
				writeCookie(STALE_TIME_COOKIE, value);
				applyStaleTime(props.queryDefaults, next);
				staleTime = next;
			},
			options: staleTimeOptions.map((option) => ({
				label: option.label,
				value: option.ms,
			})),
			value: staleTime,
		},
		{
			label: "Latency",
			onchange: (value: string) => {
				writeCookie(LATENCY_COOKIE, value);
				latency = parseLatency(value) ?? DEFAULT_LATENCY_MS;
			},
			options: latencyOptions.map((option) => ({
				label: option.label,
				value: option.ms,
			})),
			value: latency,
		},
	]);

	function reset() {
		clearCookie(PREFETCH_COOKIE);
		clearCookie(LATENCY_COOKIE);
		clearCookie(STALE_TIME_COOKIE);
		applyStaleTime(props.queryDefaults, DEFAULT_STALE_TIME);
		latency = DEFAULT_LATENCY_MS;
		staleTime = DEFAULT_STALE_TIME;
		prefetch.current = DEFAULT_PREFETCH;
		queryClient.clear();
		window.location.reload();
	}
</script>

<div class="flex items-end gap-2">
	<div class="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:flex-none">
		{#each settings as setting (setting.label)}
			<label class="flex min-w-0 flex-col gap-1">
				<span
					class="text-[0.7rem] font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase"
				>
					{setting.label}
				</span>
				<NativeSelect
					class="w-full sm:w-fit"
					onchange={(event) => {
						setting.onchange(event.currentTarget.value);
					}}
					size="sm"
					value={setting.value}
				>
					{#each setting.options as option (option.label)}
						<NativeSelectOption value={option.value}>{option.label}</NativeSelectOption>
					{/each}
				</NativeSelect>
			</label>
		{/each}
	</div>
	<Button
		aria-label="Reset settings"
		onclick={reset}
		size="icon-sm"
		title="Reset settings"
		variant="ghost"
	>
		<RotateCcw />
	</Button>
</div>
