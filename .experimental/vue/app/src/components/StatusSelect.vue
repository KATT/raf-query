<script setup lang="ts">
// Status badge that opens a menu of statuses and saves the choice
// optimistically. The trigger is disabled until the write and the refetch
// it starts settle.
import { type IssueStatus, issueStatuses } from "@examples/db/types";
import { Check } from "@lucide/vue";
import { useQueryClient } from "@raf-query/experimental-vue";
import { cn } from "cn";
import { computed, ref } from "vue";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, parseResponse } from "@/lib/api.ts";
import { warnMockDbWrite } from "@/lib/mock-db-toast.ts";
import { statusLabel } from "@/lib/status.ts";

import StatusBadge from "./StatusBadge.vue";
import StatusDot from "./StatusDot.vue";

const props = defineProps<{
	readonly align?: "start" | "center" | "end";
	readonly issueId: number;
	readonly status: IssueStatus;
}>();
const queryClient = useQueryClient();
const optimistic = ref<IssueStatus>();
const isPending = ref(false);
const status = computed(() => optimistic.value ?? props.status);

async function select(next: IssueStatus) {
	if (next === props.status) {
		return;
	}
	warnMockDbWrite();
	optimistic.value = next;
	isPending.value = true;
	try {
		await parseResponse(
			api.issues[":id"].$patch({
				json: { status: next },
				param: { id: String(props.issueId) },
			}),
		);
		await queryClient.invalidate({ queryKey: ["issues"] });
	} finally {
		isPending.value = false;
		optimistic.value = undefined;
	}
}
</script>

<template>
	<DropdownMenu>
		<DropdownMenuTrigger
			:aria-label="`Status: ${statusLabel(status)}. Change status`"
			:class="
				cn(
					'rounded-full outline-none transition-opacity focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none',
					isPending && 'opacity-60',
				)
			"
			:disabled="isPending"
		>
			<StatusBadge interactive :status="status" />
		</DropdownMenuTrigger>
		<DropdownMenuContent :align="props.align ?? 'end'" class="min-w-40">
			<DropdownMenuItem
				v-for="option in issueStatuses"
				:key="option"
				class="gap-2"
				@select="select(option)"
			>
				<StatusDot :status="option" />
				{{ statusLabel(option) }}
				<Check
					v-if="option === status"
					aria-hidden="true"
					class="ml-auto size-3.5 opacity-70"
				/>
				<span v-else aria-hidden="true" class="ml-auto size-3.5"></span>
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
</template>
