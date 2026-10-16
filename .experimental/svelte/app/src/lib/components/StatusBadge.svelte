<script lang="ts">
	import type { IssueStatus } from "@examples/db/types";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";

	import { Badge } from "#lib/components/ui/badge/index.ts";
	import { statusLabel } from "#lib/status.ts";

	import StatusDot from "./StatusDot.svelte";

	const props: { readonly interactive?: boolean; readonly status: IssueStatus } =
		$props();
</script>

<Badge class="gap-1.5" variant="outline">
	<StatusDot status={props.status} />
	{statusLabel(props.status)}
	{#if props.interactive}
		<ChevronDown aria-hidden="true" class="size-3 opacity-60" />
	{/if}
</Badge>
