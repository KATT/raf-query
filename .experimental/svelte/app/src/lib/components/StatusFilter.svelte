<script lang="ts">
	import {
		type IssueListInput,
		issueSorts,
		issueStatuses,
	} from "@examples/db/types";
	import { type QueryHandle, useQuery } from "@raf-query/experimental-svelte";

	import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
	import { verbHref } from "#lib/links.ts";
	import { issueCountsQuery } from "#lib/queries.ts";
	import { statusLabel } from "#lib/status.ts";
	import { cn } from "#lib/utils.ts";

	import AppLink from "./AppLink.svelte";

	const props: {
		readonly counts: QueryHandle<typeof issueCountsQuery>;
		readonly current: IssueListInput;
	} = $props();
	const counts = useQuery(issueCountsQuery, () => props.counts);

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

{#if counts.data}
	<aside class="grid content-start gap-3 md:gap-6">
		<nav class="flex flex-wrap gap-1 md:grid">
			{#each ["all", ...issueStatuses] as const as status (status)}
				<AppLink
					class={cn(
						"flex justify-between gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted",
						props.current.status === status && "bg-muted font-medium",
					)}
					href={issuesHref({ ...props.current, status })}
				>
					{statusLabel(status)}
					<span class="text-muted-foreground">{counts.data[status]}</span>
				</AppLink>
			{/each}
		</nav>
		<nav class="flex flex-wrap items-center gap-1 md:grid">
			<span class="px-3 text-xs font-medium text-muted-foreground uppercase">
				Sort
			</span>
			{#each issueSorts as sort (sort)}
				<AppLink
					class={cn(
						"rounded-md px-3 py-1.5 text-sm capitalize hover:bg-muted",
						props.current.sort === sort && "bg-muted font-medium",
					)}
					href={issuesHref({ ...props.current, sort })}
				>
					{sort}
				</AppLink>
			{/each}
		</nav>
	</aside>
{:else}
	<Skeleton class="h-20 md:h-48" />
{/if}
