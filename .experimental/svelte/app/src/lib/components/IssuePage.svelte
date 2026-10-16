<script lang="ts">
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import { type QueryHandle, useQuery } from "@raf-query/experimental-svelte";

	import { Button, buttonVariants } from "#lib/components/ui/button/index.ts";
	import { Separator } from "#lib/components/ui/separator/index.ts";
	import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
	import { verbHref } from "#lib/links.ts";
	import type {
		assigneeQuery,
		commentsQuery,
	} from "#lib/queries.ts";
	import { issueQuery } from "#lib/queries.ts";

	import AppLink from "./AppLink.svelte";
	import AssigneeCard from "./AssigneeCard.svelte";
	import Comments from "./Comments.svelte";
	import EditBody from "./EditBody.svelte";
	import EditTitle from "./EditTitle.svelte";
	import NotFound from "./NotFound.svelte";
	import StatusSelect from "./StatusSelect.svelte";

	const props: {
		readonly assignee: QueryHandle<typeof assigneeQuery>;
		readonly comments: QueryHandle<typeof commentsQuery>;
		readonly id: number;
		readonly issue: QueryHandle<typeof issueQuery>;
	} = $props();
	const issue = useQuery(issueQuery, () => props.issue);
</script>

{#if issue.data === null}
	<NotFound />
{:else}
	<div class="grid gap-6">
		<nav class="flex items-center gap-2">
			<AppLink
				class={buttonVariants({ size: "sm", variant: "ghost" })}
				href={verbHref("/issues")}
			>
				<ArrowLeft /> All issues
			</AppLink>
			<div class="ml-auto flex gap-1">
				{#if props.id > 1}
					<AppLink
						aria-label="Previous issue"
						class={buttonVariants({ size: "icon", variant: "outline" })}
						href={verbHref(`/issues/${props.id - 1}`)}
						title="Previous issue"
					>
						<ChevronLeft />
					</AppLink>
				{:else}
					<Button
						aria-label="Previous issue"
						disabled
						size="icon"
						title="Previous issue"
						variant="outline"
					>
						<ChevronLeft />
					</Button>
				{/if}
				<AppLink
					aria-label="Next issue"
					class={buttonVariants({ size: "icon", variant: "outline" })}
					href={verbHref(`/issues/${props.id + 1}`)}
					title="Next issue"
				>
					<ChevronRight />
				</AppLink>
			</div>
		</nav>
		<div class="grid gap-x-8 gap-y-6 md:grid-cols-[1fr_240px]">
			<article class="grid content-start gap-6 md:col-start-1">
				{#if issue.data}
					<div class="grid gap-6">
						<EditTitle issue={issue.data} />
						<p class="text-sm text-muted-foreground">
							Opened {new Date(issue.data.createdAt).toDateString()}
						</p>
						<EditBody issue={issue.data} />
					</div>
				{:else if issue.error}
					<p class="text-sm text-destructive">Couldn't load the issue.</p>
				{:else}
					<div class="grid gap-6">
						<div class="flex items-baseline gap-2">
							<Skeleton class="h-9 min-w-0 flex-1" />
							<span class="shrink-0 text-lg text-muted-foreground">#{props.id}</span>
						</div>
						<Skeleton class="h-5 w-40" />
						<Skeleton class="h-28" />
					</div>
				{/if}
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
						{#if issue.data}
							<StatusSelect
								align="end"
								issueId={issue.data.id}
								status={issue.data.status}
							/>
						{:else}
							<Skeleton class="h-6 w-24 rounded-full" />
						{/if}
					</div>
				</section>
				<AssigneeCard assignee={props.assignee} />
			</aside>
			<div class="grid gap-6 md:col-start-1">
				<Separator />
				<Comments comments={props.comments} />
			</div>
		</div>
	</div>
{/if}
