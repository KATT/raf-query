<script lang="ts">
	import { type QueryHandle, useQuery } from "@raf-query/experimental-svelte";

	import * as Avatar from "#lib/components/ui/avatar/index.ts";
	import { Card, CardContent } from "#lib/components/ui/card/index.ts";
	import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
	import { assigneeQuery } from "#lib/queries.ts";

	const props: { readonly assignee: QueryHandle<typeof assigneeQuery> } =
		$props();
	const assignee = useQuery(assigneeQuery, () => props.assignee);

	function initials(name: string) {
		return name
			.split(" ")
			.map((part) => part[0])
			.join("");
	}
</script>

{#if assignee.data}
	<Card class="py-4">
		<CardContent class="flex items-center gap-3 px-4">
			<Avatar.Root>
				<Avatar.Fallback>{initials(assignee.data.name)}</Avatar.Fallback>
			</Avatar.Root>
			<div class="grid">
				<span class="text-xs text-muted-foreground">Assignee</span>
				<span class="font-medium">{assignee.data.name}</span>
				<span class="text-xs text-muted-foreground">{assignee.data.title}</span>
			</div>
		</CardContent>
	</Card>
{:else if assignee.data === undefined && !assignee.error}
	<Skeleton class="h-[74px]" />
{/if}
