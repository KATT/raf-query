<script lang="ts">
	import { HydrationBoundary } from "@raf-query/experimental-svelte";

	import IssueList from "#lib/components/IssueList.svelte";
	import StatusFilter from "#lib/components/StatusFilter.svelte";

	import type { PageProps } from "./$types";

	const props: PageProps = $props();
</script>

<HydrationBoundary state={props.data.queries}>
	<div class="grid gap-6 md:grid-cols-[180px_1fr] md:gap-8">
		<StatusFilter counts={props.data.counts} current={props.data.input} />
		<IssueList issues={props.data.issues} />
	</div>
</HydrationBoundary>
