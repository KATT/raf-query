<script setup lang="ts">
import type { IssueStatus } from "@examples/db/types";
import { ChevronDown } from "@lucide/vue";

import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/status.ts";

import StatusDot from "./StatusDot.vue";

const props = defineProps<{
	readonly interactive?: boolean;
	readonly status: IssueStatus;
}>();
</script>

<template>
	<Badge class="gap-1.5" variant="outline">
		<StatusDot :status="props.status" />
		{{ statusLabel(props.status) }}
		<ChevronDown
			v-if="props.interactive"
			aria-hidden="true"
			class="size-3 opacity-60"
		/>
	</Badge>
</template>
