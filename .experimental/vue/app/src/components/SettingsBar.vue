<script setup lang="ts">
// The top bar's settings: the loader verb, link prefetching, stale time,
// latency, and Reset. Each choice but the verb lives in a cookie.
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
import { RotateCcw } from "@lucide/vue";
import { useQueryClient } from "@raf-query/experimental-vue";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { Button } from "@/components/ui/button";
import {
	NativeSelect,
	NativeSelectOption,
} from "@/components/ui/native-select";
import { usePrefetchSetting } from "@/lib/prefetch.ts";
import {
	clearCookie,
	DEFAULT_PREFETCH,
	parsePrefetch,
	PREFETCH_COOKIE,
	prefetchOptions,
	writeCookie,
} from "@/lib/settings.ts";

const props = defineProps<{
	readonly latency: number;
	readonly queryDefaults: QueryTimeDefaults;
	readonly staleTime: number;
	readonly verb: LoaderVerb;
}>();
const queryClient = useQueryClient();
const prefetch = usePrefetchSetting();
const route = useRoute();
const router = useRouter();
const latency = ref(props.latency);
const staleTime = ref(props.staleTime);

const settings = computed(() => [
	{
		label: "Loader",
		onChange: (value: string) => {
			const verb = LoaderVerb.safeParse(value);
			if (verb.success) {
				// Any origin: only the path and search are read.
				const url = new URL(route.fullPath, "http://localhost");
				void router.push(withLoaderVerb(url, verb.data));
			}
		},
		options: loaderVerbs.map((verb) => ({ label: verb, value: verb })),
		value: props.verb,
	},
	{
		label: "Prefetch links",
		onChange: (value: string) => {
			const next = parsePrefetch(value);
			writeCookie(PREFETCH_COOKIE, next);
			prefetch.value = next;
		},
		options: prefetchOptions,
		value: prefetch.value,
	},
	{
		label: "Stale time",
		onChange: (value: string) => {
			const next = parseStaleTime(value);
			if (next === undefined) {
				return;
			}
			writeCookie(STALE_TIME_COOKIE, value);
			applyStaleTime(props.queryDefaults, next);
			staleTime.value = next;
		},
		options: staleTimeOptions.map((option) => ({
			label: option.label,
			value: String(option.ms),
		})),
		value: String(staleTime.value),
	},
	{
		label: "Latency",
		onChange: (value: string) => {
			writeCookie(LATENCY_COOKIE, value);
			latency.value = parseLatency(value) ?? DEFAULT_LATENCY_MS;
		},
		options: latencyOptions.map((option) => ({
			label: option.label,
			value: String(option.ms),
		})),
		value: String(latency.value),
	},
]);

function reset() {
	clearCookie(PREFETCH_COOKIE);
	clearCookie(LATENCY_COOKIE);
	clearCookie(STALE_TIME_COOKIE);
	applyStaleTime(props.queryDefaults, DEFAULT_STALE_TIME);
	latency.value = DEFAULT_LATENCY_MS;
	staleTime.value = DEFAULT_STALE_TIME;
	prefetch.value = DEFAULT_PREFETCH;
	queryClient.clear();
	window.location.reload();
}
</script>

<template>
	<div class="flex items-end gap-2">
		<div class="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:flex-none">
			<label
				v-for="setting in settings"
				:key="setting.label"
				class="flex min-w-0 flex-col gap-1"
			>
				<span
					class="text-[0.7rem] font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase"
				>
					{{ setting.label }}
				</span>
				<NativeSelect
					class="h-8 w-full py-1 sm:w-fit"
					:model-value="setting.value"
					@change="setting.onChange(($event.target as HTMLSelectElement).value)"
				>
					<NativeSelectOption
						v-for="option in setting.options"
						:key="option.label"
						:value="option.value"
					>
						{{ option.label }}
					</NativeSelectOption>
				</NativeSelect>
			</label>
		</div>
		<Button
			aria-label="Reset settings"
			size="icon-sm"
			title="Reset settings"
			variant="ghost"
			@click="reset"
		>
			<RotateCcw />
		</Button>
	</div>
</template>
