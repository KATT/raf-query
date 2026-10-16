<script lang="ts">
	import { type QueryHandle, useQuery } from "@raf-query/experimental-svelte";

	import { Card } from "#lib/components/ui/card/index.ts";
	import { verbHref } from "#lib/links.ts";
	import { issueListQuery } from "#lib/queries.ts";
	import { cn } from "#lib/utils.ts";

	import AppLink from "./AppLink.svelte";
	import { issueRowClassName } from "./issue-row.ts";
	import IssueRow from "./IssueRow.svelte";
	import IssueRowSkeletons from "./IssueRowSkeletons.svelte";
	import LoadMore from "./LoadMore.svelte";
	import StatusSelect from "./StatusSelect.svelte";

	const props: { readonly issues: QueryHandle<typeof issueListQuery> } =
		$props();
	// A new filter or sort keeps the last list on screen, dimmed, until it loads.
	const list = useQuery(issueListQuery, () => props.issues, () => ({
		whilePending: "previous",
	}));
	const lastPage = $derived(list.data?.pages.at(-1));
	const total = $derived(lastPage?.total ?? 0);
	const shown = $derived(
		list.data?.pages.reduce((sum, page) => sum + page.issues.length, 0) ?? 0,
	);
</script>

{#if list.data}
	<div
		aria-busy={list.isPrevious || list.isFetchingNextPage}
		class={cn("grid gap-4 transition-opacity", list.isPrevious && "opacity-50")}
	>
		<p class="text-sm text-muted-foreground">
			Showing {shown} of {total} issues
		</p>
		<Card class="gap-0 divide-y py-0">
			{#if shown === 0}
				<p class="p-6 text-sm text-muted-foreground">No issues.</p>
			{/if}
			{#each list.data.pages as page, index (list.data.pageParams[index])}
				<div class={cn("divide-y", index > 0 && "animate-in duration-500 fade-in")}>
					{#each page.issues as issue (issue.id)}
						<AppLink class={issueRowClassName} href={verbHref(`/issues/${issue.id}`)}>
							<IssueRow {issue}>
								<StatusSelect issueId={issue.id} status={issue.status} />
							</IssueRow>
						</AppLink>
					{/each}
				</div>
			{/each}
			{#if list.isFetchingNextPage}
				<IssueRowSkeletons
					count={Math.min(lastPage?.issues.length ?? 0, total - shown)}
				/>
			{/if}
		</Card>
		{#if list.hasNextPage && !list.isFetchingNextPage}
			<LoadMore onload={() => void list.fetchNextPage()} />
		{/if}
	</div>
{:else if list.error}
	<p class="text-sm text-destructive">Couldn't load the issues.</p>
{:else}
	<Card class="gap-0 py-0">
		<IssueRowSkeletons count={10} />
	</Card>
{/if}
