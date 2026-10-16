<script lang="ts">
	import { useIsFetching } from "@raf-query/svelte";

	const fetching = useIsFetching();
</script>

{#if fetching.current > 0}<progress aria-label="Loading"></progress>{/if}
