<script setup lang="ts">
import IssuePage from "@/components/IssuePage.vue";
import type { IssueData } from "@/loaders.ts";

const props = defineProps<{ readonly data: IssueData }>();
</script>

<template>
	<!-- Previous and next stay on this route, so a new id mounts a fresh page. -->
	<IssuePage
		:key="props.data.id"
		:assignee="props.data.assignee"
		:comments="props.data.comments"
		:issue="props.data.issue"
		:id="props.data.id"
	/>
</template>
