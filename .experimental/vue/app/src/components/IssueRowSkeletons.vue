<script setup lang="ts">
import { Skeleton } from "@/components/ui/skeleton";

import { rowClassName } from "./issue-row.ts";

const props = defineProps<{ readonly count: number }>();
</script>

<template>
	<div class="divide-y">
		<div v-for="index in props.count" :key="index" :class="rowClassName">
			<Skeleton class="h-4 w-10" />
			<Skeleton class="h-4 flex-1" />
			<Skeleton class="h-5 w-20 rounded-full" />
		</div>
	</div>
</template>
