<!--
@component
The issue body, editable in place. Blur or Cmd/Ctrl+Enter saves; Escape
cancels. Shows the new text while it saves.
-->
<script lang="ts">
	import type { Issue } from "@examples/db/types";
	import { useQueryClient } from "@raf-query/experimental-svelte";

	import { api, parseResponse } from "#lib/api.ts";
	import { warnMockDbWrite } from "#lib/mock-db-toast.ts";
	import { cn } from "#lib/utils.ts";

	const props: { readonly issue: Issue } = $props();
	const queryClient = useQueryClient();
	let optimistic = $state<string>();
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);
	const body = $derived(optimistic ?? props.issue.body);

	async function save(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
		event.preventDefault();
		const issue = props.issue;
		const next = String(
			new FormData(event.currentTarget).get("body") ?? "",
		).trim();
		if (next === issue.body) {
			saveError = null;
			return;
		}
		if (next === "") {
			saveError = "Description can't be empty";
			return;
		}
		saveError = null;
		warnMockDbWrite();
		optimistic = next;
		isSaving = true;
		try {
			await parseResponse(
				api.issues[":id"].$patch({
					json: { body: next },
					param: { id: String(issue.id) },
				}),
			);
			await queryClient.invalidate({ queryKey: ["issues"] });
		} catch (error) {
			saveError = error instanceof Error ? error.message : String(error);
		} finally {
			isSaving = false;
			optimistic = undefined;
		}
	}
</script>

<form class="grid gap-1" onsubmit={save}>
	<textarea
		aria-label="Description"
		class={cn(
			"min-h-28 w-full resize-y rounded-md bg-transparent px-1.5 py-1 text-sm whitespace-pre-line outline-none",
			"-mx-1.5 transition-[box-shadow,background-color]",
			"hover:bg-muted/60 focus:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50",
			isSaving && "opacity-70",
		)}
		disabled={isSaving}
		name="body"
		onblur={(event) => {
			if (event.currentTarget.value.trim() === props.issue.body) {
				return;
			}
			event.currentTarget.form?.requestSubmit();
		}}
		onkeydown={(event) => {
			if (event.key === "Escape") {
				event.currentTarget.value = props.issue.body;
				event.currentTarget.blur();
			}
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				event.currentTarget.blur();
			}
		}}
		rows={5}
		value={body}
	></textarea>
	{#if saveError !== null}
		<p class="text-sm text-destructive">{saveError}</p>
	{/if}
</form>
