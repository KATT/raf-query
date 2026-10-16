<script setup lang="ts">
import {
	type IssueListInput,
	issueSorts,
	issueStatuses,
} from "@examples/db/types";
import { type QueryHandle, useQuery } from "@raf-query/experimental-vue";
import { cn } from "cn";

import { Skeleton } from "@/components/ui/skeleton";
import { useVerbHref } from "@/lib/links.ts";
import { issueCountsQuery } from "@/lib/queries.ts";
import { statusLabel } from "@/lib/status.ts";

import AppLink from "./AppLink.vue";

const props = defineProps<{
	readonly counts: QueryHandle<typeof issueCountsQuery>;
	readonly current: IssueListInput;
}>();
const verbHref = useVerbHref();
const counts = useQuery(issueCountsQuery, () => props.counts);
const statuses = ["all", ...issueStatuses] as const;

/** The list's URL for an input, leaving out the defaults. */
function issuesHref(input: IssueListInput) {
	const params = new URLSearchParams();
	if (input.status !== "all") {
		params.set("status", input.status);
	}
	if (input.sort !== "newest") {
		params.set("sort", input.sort);
	}
	const search = params.toString();
	return verbHref(`/issues${search ? `?${search}` : ""}`);
}
</script>

<template>
	<aside v-if="counts.data" class="grid content-start gap-3 md:gap-6">
		<nav class="flex flex-wrap gap-1 md:grid">
			<AppLink
				v-for="status in statuses"
				:key="status"
				:class="
					cn(
						'flex justify-between gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted',
						props.current.status === status && 'bg-muted font-medium',
					)
				"
				:href="issuesHref({ ...props.current, status })"
			>
				{{ statusLabel(status) }}
				<span class="text-muted-foreground">{{ counts.data[status] }}</span>
			</AppLink>
		</nav>
		<nav class="flex flex-wrap items-center gap-1 md:grid">
			<span class="px-3 text-xs font-medium text-muted-foreground uppercase">
				Sort
			</span>
			<AppLink
				v-for="sort in issueSorts"
				:key="sort"
				:class="
					cn(
						'rounded-md px-3 py-1.5 text-sm capitalize hover:bg-muted',
						props.current.sort === sort && 'bg-muted font-medium',
					)
				"
				:href="issuesHref({ ...props.current, sort })"
			>
				{{ sort }}
			</AppLink>
		</nav>
	</aside>
	<Skeleton v-else class="h-20 md:h-48" />
</template>
