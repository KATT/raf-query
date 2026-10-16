<script setup lang="ts">
import IssueList from "@/components/IssueList.vue";
import StatusFilter from "@/components/StatusFilter.vue";
import type { IssuesData } from "@/loaders.ts";

const props = defineProps<{ readonly data: IssuesData }>();
</script>

<template>
	<div class="grid gap-6 md:grid-cols-[180px_1fr] md:gap-8">
		<StatusFilter :counts="props.data.counts" :current="props.data.input" />
		<IssueList :issues="props.data.issues" />
	</div>
</template>
