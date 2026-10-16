<script setup lang="ts">
import { ArrowLeft, ChevronLeft, ChevronRight } from "@lucide/vue";
import { type QueryHandle, useQuery } from "@raf-query/experimental-vue";

import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useVerbHref } from "@/lib/links.ts";
import {
	type assigneeQuery,
	type commentsQuery,
	issueQuery,
} from "@/lib/queries.ts";

import AppLink from "./AppLink.vue";
import AssigneeCard from "./AssigneeCard.vue";
import EditBody from "./EditBody.vue";
import EditTitle from "./EditTitle.vue";
import IssueComments from "./IssueComments.vue";
import NotFound from "./NotFound.vue";
import StatusSelect from "./StatusSelect.vue";

const props = defineProps<{
	readonly assignee: QueryHandle<typeof assigneeQuery>;
	readonly comments: QueryHandle<typeof commentsQuery>;
	readonly id: number;
	readonly issue: QueryHandle<typeof issueQuery>;
}>();
const verbHref = useVerbHref();
const issue = useQuery(issueQuery, () => props.issue);
</script>

<template>
	<NotFound v-if="issue.data === null" />
	<div v-else class="grid gap-6">
		<nav class="flex items-center gap-2">
			<AppLink
				:class="buttonVariants({ size: 'sm', variant: 'ghost' })"
				:href="verbHref('/issues')"
			>
				<ArrowLeft /> All issues
			</AppLink>
			<div class="ml-auto flex gap-1">
				<AppLink
					v-if="props.id > 1"
					aria-label="Previous issue"
					:class="buttonVariants({ size: 'icon', variant: 'outline' })"
					:href="verbHref(`/issues/${props.id - 1}`)"
					title="Previous issue"
				>
					<ChevronLeft />
				</AppLink>
				<Button
					v-else
					aria-label="Previous issue"
					disabled
					size="icon"
					title="Previous issue"
					variant="outline"
				>
					<ChevronLeft />
				</Button>
				<AppLink
					aria-label="Next issue"
					:class="buttonVariants({ size: 'icon', variant: 'outline' })"
					:href="verbHref(`/issues/${props.id + 1}`)"
					title="Next issue"
				>
					<ChevronRight />
				</AppLink>
			</div>
		</nav>
		<!-- On phones the properties sit between the body and the comments. -->
		<div class="grid gap-x-8 gap-y-6 md:grid-cols-[1fr_240px]">
			<article class="grid content-start gap-6 md:col-start-1">
				<div v-if="issue.data" class="grid gap-6">
					<EditTitle :issue="issue.data" />
					<p class="text-sm text-muted-foreground">
						{{ `Opened ${new Date(issue.data.createdAt).toDateString()}` }}
					</p>
					<EditBody :issue="issue.data" />
				</div>
				<p v-else-if="issue.error" class="text-sm text-destructive">
					Couldn't load the issue.
				</p>
				<div v-else class="grid gap-6">
					<div class="flex items-baseline gap-2">
						<Skeleton class="h-9 min-w-0 flex-1" />
						<span class="shrink-0 text-lg text-muted-foreground"
							>#{{ props.id }}</span
						>
					</div>
					<Skeleton class="h-5 w-40" />
					<Skeleton class="h-28" />
				</div>
			</article>
			<aside
				class="grid content-start gap-4 md:col-start-2 md:row-span-2 md:row-start-1"
			>
				<section class="grid gap-3 rounded-lg border p-3">
					<h2
						class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
					>
						Properties
					</h2>
					<div class="flex items-center justify-between gap-3">
						<span class="text-sm text-muted-foreground">Status</span>
						<StatusSelect
							v-if="issue.data"
							align="end"
							:issue-id="issue.data.id"
							:status="issue.data.status"
						/>
						<Skeleton v-else class="h-6 w-24 rounded-full" />
					</div>
				</section>
				<AssigneeCard :assignee="props.assignee" />
			</aside>
			<div class="grid gap-6 md:col-start-1">
				<Separator />
				<IssueComments :comments="props.comments" />
			</div>
		</div>
	</div>
</template>
