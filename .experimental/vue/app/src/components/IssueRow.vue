<script setup lang="ts">
// An issue row's contents, for inside its link. The default slot (the
// status control) sits in a span that cancels clicks, so using it doesn't
// navigate.
import type { Issue } from "@examples/db/types";
import { MessageSquare } from "@lucide/vue";

const props = defineProps<{ readonly issue: Issue }>();

const dateFormat = new Intl.DateTimeFormat("en", {
	day: "numeric",
	month: "short",
});
</script>

<template>
	<span class="w-10 shrink-0 text-sm text-muted-foreground"
		>#{{ props.issue.id }}</span
	>
	<!-- `w-0`: the full title must not set the row's minimum width on phones. -->
	<span class="w-0 flex-1 truncate font-medium">{{ props.issue.title }}</span>
	<span
		class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground max-sm:hidden"
	>
		<MessageSquare class="size-3" />
		{{ props.issue.commentCount }}
	</span>
	<span
		class="w-14 shrink-0 text-right text-xs text-muted-foreground max-sm:hidden"
	>
		{{ dateFormat.format(new Date(props.issue.createdAt)) }}
	</span>
	<span class="shrink-0" @auxclick.prevent @click.prevent>
		<slot />
	</span>
</template>
