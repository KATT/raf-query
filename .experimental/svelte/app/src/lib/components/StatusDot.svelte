<script lang="ts">
	import type { IssueStatus } from "@examples/db/types";

	import { statusDots } from "#lib/status.ts";
	import { cn } from "#lib/utils.ts";

	const props: { readonly status: IssueStatus } = $props();
</script>

<span aria-hidden="true" class={cn("size-1.5 rounded-full", statusDots[props.status])}></span>
