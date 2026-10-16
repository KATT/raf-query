<script lang="ts">
	import { HydrationBoundary } from "@raf-query/experimental-svelte";

	import IssuePage from "#lib/components/IssuePage.svelte";

	import type { PageProps } from "./$types";

	const props: PageProps = $props();
</script>

<HydrationBoundary state={props.data.queries}>
	<!-- Previous and next stay on this route, so a new id mounts a fresh page. -->
	{#key props.data.id}
		<IssuePage
			assignee={props.data.assignee}
			comments={props.data.comments}
			id={props.data.id}
			issue={props.data.issue}
		/>
	{/key}
</HydrationBoundary>
