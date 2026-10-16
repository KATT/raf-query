<!--
@component
Status badge that opens a menu of statuses and saves the choice
optimistically. The trigger is disabled until the write and the refetch
it starts settle.
-->
<script lang="ts">
	import { type IssueStatus, issueStatuses } from "@examples/db/types";
	import Check from "@lucide/svelte/icons/check";
	import { useQueryClient } from "@raf-query/experimental-svelte";

	import { api, parseResponse } from "#lib/api.ts";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.ts";
	import { warnMockDbWrite } from "#lib/mock-db-toast.ts";
	import { statusLabel } from "#lib/status.ts";
	import { cn } from "#lib/utils.ts";

	import StatusBadge from "./StatusBadge.svelte";
	import StatusDot from "./StatusDot.svelte";

	const props: {
		readonly align?: "start" | "center" | "end";
		readonly issueId: number;
		readonly status: IssueStatus;
	} = $props();
	const queryClient = useQueryClient();
	let optimistic = $state<IssueStatus>();
	let isPending = $state(false);
	const status = $derived(optimistic ?? props.status);

	async function select(next: IssueStatus) {
		if (next === props.status) {
			return;
		}
		warnMockDbWrite();
		optimistic = next;
		isPending = true;
		try {
			await parseResponse(
				api.issues[":id"].$patch({
					json: { status: next },
					param: { id: String(props.issueId) },
				}),
			);
			await queryClient.invalidate({ queryKey: ["issues"] });
		} finally {
			isPending = false;
			optimistic = undefined;
		}
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label={`Status: ${statusLabel(status)}. Change status`}
		class={cn(
			"rounded-full outline-none transition-opacity focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none",
			isPending && "opacity-60",
		)}
		disabled={isPending}
	>
		<StatusBadge interactive {status} />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align={props.align ?? "end"} class="min-w-40">
		{#each issueStatuses as option (option)}
			<DropdownMenu.Item class="gap-2" onSelect={() => select(option)}>
				<StatusDot status={option} />
				{statusLabel(option)}
				{#if option === status}
					<Check aria-hidden="true" class="ml-auto size-3.5 opacity-70" />
				{:else}
					<span aria-hidden="true" class="ml-auto size-3.5"></span>
				{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
