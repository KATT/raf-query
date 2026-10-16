<script setup lang="ts">
import { type QueryHandle, useQuery } from "@raf-query/experimental-vue";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { assigneeQuery } from "@/lib/queries.ts";

const props = defineProps<{
	readonly assignee: QueryHandle<typeof assigneeQuery>;
}>();
const assignee = useQuery(assigneeQuery, () => props.assignee);

function initials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("");
}
</script>

<template>
	<Card v-if="assignee.data" class="py-4">
		<CardContent class="flex items-center gap-3 px-4">
			<Avatar>
				<AvatarFallback>{{ initials(assignee.data.name) }}</AvatarFallback>
			</Avatar>
			<div class="grid">
				<span class="text-xs text-muted-foreground">Assignee</span>
				<span class="font-medium">{{ assignee.data.name }}</span>
				<span class="text-xs text-muted-foreground">{{
					assignee.data.title
				}}</span>
			</div>
		</CardContent>
	</Card>
	<Skeleton
		v-else-if="assignee.data === undefined && !assignee.error"
		class="h-[74px]"
	/>
</template>
