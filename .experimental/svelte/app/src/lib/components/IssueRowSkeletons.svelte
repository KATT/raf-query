<script lang="ts">
	import { Skeleton } from "#lib/components/ui/skeleton/index.ts";

	import { rowClassName } from "./issue-row.ts";

	const props: { readonly count: number } = $props();
</script>

<div class="divide-y">
	{#each { length: props.count }, index (index)}
		<div class={rowClassName}>
			<Skeleton class="h-4 w-10" />
			<Skeleton class="h-4 flex-1" />
			<Skeleton class="h-5 w-20 rounded-full" />
		</div>
	{/each}
</div>
