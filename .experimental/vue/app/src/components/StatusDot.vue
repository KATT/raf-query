<script setup lang="ts">
import type { IssueStatus } from "@examples/db/types";
import { cn } from "cn";

import { statusDots } from "@/lib/status.ts";

const props = defineProps<{ readonly status: IssueStatus }>();
</script>

<template>
	<span
		aria-hidden="true"
		:class="cn('size-1.5 rounded-full', statusDots[props.status])"
	></span>
</template>
