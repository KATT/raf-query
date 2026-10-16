<script setup lang="ts">
import type { QueryTimeDefaults } from "@examples/db/types";
import { loaderVerbHint, loaderVerbOf } from "@examples/kit/lib/loader-verb";
import { logoUrl } from "@examples/kit/lib/logo";
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";

import AppLink from "@/components/AppLink.vue";
import NavigationProgress from "@/components/NavigationProgress.vue";
import SettingsBar from "@/components/SettingsBar.vue";
import { Toaster } from "@/components/ui/sonner";
import type { Settings } from "@/lib/settings.ts";
import { useNavigating } from "@/router.ts";

const props = defineProps<{
	readonly queryDefaults: QueryTimeDefaults;
	readonly settings: Settings;
}>();
const route = useRoute();
const navigating = useNavigating();
const verb = computed(() => loaderVerbOf(route.path));
</script>

<template>
	<NavigationProgress v-if="navigating" />
	<header class="border-b">
		<div
			class="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-3 pb-2.5 sm:px-6 lg:flex-row lg:items-end lg:justify-between"
		>
			<div class="flex min-w-0 items-center gap-3 lg:pb-1">
				<AppLink
					class="flex shrink-0 items-center gap-2.5 font-semibold"
					:href="`/${verb}/issues`"
				>
					<img
						alt=""
						class="size-6 shrink-0"
						data-slot="logo"
						height="32"
						:src="logoUrl"
						width="32"
					/>
					Issues
				</AppLink>
				<span
					class="truncate rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
				>
					raf-query · Vue
				</span>
			</div>
			<SettingsBar
				:latency="props.settings.latency"
				:query-defaults="props.queryDefaults"
				:stale-time="props.settings.staleTime"
				:verb="verb"
			/>
		</div>
		<div class="mx-auto max-w-5xl px-4 pb-2.5 sm:px-6">
			<p class="text-xs text-muted-foreground">
				<code class="font-mono font-medium text-foreground">{{ verb }}</code>
				{{ " " }}{{ loaderVerbHint("browser", verb) }}
			</p>
		</div>
	</header>
	<main class="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
		<RouterView />
	</main>
	<Toaster close-button position="bottom-right" rich-colors />
</template>
