<script lang="ts">
	import { page } from "$app/state";

	import NotFound from "#lib/components/NotFound.svelte";
</script>

{#if page.status === 404}
	<NotFound />
{:else}
	<h1 class="text-2xl font-semibold">Error</h1>
	<p class="mt-2 text-muted-foreground">
		{page.error?.message ?? "An unexpected error occurred."}
	</p>
{/if}
