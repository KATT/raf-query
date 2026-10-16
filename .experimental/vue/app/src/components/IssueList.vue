<script setup lang="ts">
import { type QueryHandle, useQuery } from "@raf-query/experimental-vue";
import { cn } from "cn";
import { computed } from "vue";

import { Card } from "@/components/ui/card";
import { useVerbHref } from "@/lib/links.ts";
import { issueListQuery } from "@/lib/queries.ts";

import AppLink from "./AppLink.vue";
import { issueRowClassName } from "./issue-row.ts";
import IssueRow from "./IssueRow.vue";
import IssueRowSkeletons from "./IssueRowSkeletons.vue";
import LoadMore from "./LoadMore.vue";
import StatusSelect from "./StatusSelect.vue";

const props = defineProps<{
	readonly issues: QueryHandle<typeof issueListQuery>;
}>();
const verbHref = useVerbHref();
// A new filter or sort keeps the last list on screen, dimmed, until it loads.
const list = useQuery(issueListQuery, () => props.issues, {
	whilePending: "previous",
});
const lastPage = computed(() => list.data?.pages.at(-1));
const total = computed(() => lastPage.value?.total ?? 0);
const shown = computed(
	() =>
		list.data?.pages.reduce((sum, page) => sum + page.issues.length, 0) ?? 0,
);
</script>

<template>
	<div
		v-if="list.data"
		:aria-busy="list.isPrevious || list.isFetchingNextPage"
		:class="
			cn('grid gap-4 transition-opacity', list.isPrevious && 'opacity-50')
		"
	>
		<p class="text-sm text-muted-foreground">
			{{ `Showing ${shown} of ${total} issues` }}
		</p>
		<Card class="gap-0 divide-y py-0">
			<p v-if="shown === 0" class="p-6 text-sm text-muted-foreground">
				No issues.
			</p>
			<div
				v-for="(page, index) in list.data.pages"
				:key="String(list.data.pageParams[index])"
				:class="cn('divide-y', index > 0 && 'animate-in duration-500 fade-in')"
			>
				<AppLink
					v-for="issue in page.issues"
					:key="issue.id"
					:class="issueRowClassName"
					:href="verbHref(`/issues/${issue.id}`)"
				>
					<IssueRow :issue="issue">
						<StatusSelect :issue-id="issue.id" :status="issue.status" />
					</IssueRow>
				</AppLink>
			</div>
			<IssueRowSkeletons
				v-if="list.isFetchingNextPage"
				:count="Math.min(lastPage?.issues.length ?? 0, total - shown)"
			/>
		</Card>
		<LoadMore
			v-if="list.hasNextPage && !list.isFetchingNextPage"
			@load="list.fetchNextPage()"
		/>
	</div>
	<p v-else-if="list.error" class="text-sm text-destructive">
		Couldn't load the issues.
	</p>
	<Card v-else class="gap-0 py-0">
		<IssueRowSkeletons :count="10" />
	</Card>
</template>
