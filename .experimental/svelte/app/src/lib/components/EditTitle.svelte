<!--
@component
The issue title, editable in place. Click (or tab) into it, then Enter or
blur to save; Escape cancels. Shows the new title while it saves.
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
	const title = $derived(optimistic ?? props.issue.title);

	async function save(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
		event.preventDefault();
		const issue = props.issue;
		const next = String(
			new FormData(event.currentTarget).get("title") ?? "",
		).trim();
		if (next === issue.title) {
			saveError = null;
			return;
		}
		if (next === "") {
			saveError = "Title can't be empty";
			return;
		}
		saveError = null;
		warnMockDbWrite();
		optimistic = next;
		isSaving = true;
		try {
			await parseResponse(
				api.issues[":id"].$patch({
					json: { title: next },
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
	<div class="flex items-baseline gap-2">
		<!-- `w-0`: the input's own width must not set the page's minimum width on phones. -->
		<input
			aria-label="Title"
			class={cn(
				"w-0 flex-1 rounded-md bg-transparent px-1.5 py-0.5 text-2xl font-semibold tracking-tight outline-none",
				"-mx-1.5 transition-[box-shadow,background-color]",
				"hover:bg-muted/60 focus:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50",
				isSaving && "opacity-70",
			)}
			disabled={isSaving}
			name="title"
			onblur={(event) => {
				if (event.currentTarget.value.trim() === props.issue.title) {
					return;
				}
				event.currentTarget.form?.requestSubmit();
			}}
			onkeydown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					event.currentTarget.blur();
				}
				if (event.key === "Escape") {
					event.currentTarget.value = props.issue.title;
					event.currentTarget.blur();
				}
			}}
			value={title}
		/>
		<span class="shrink-0 text-lg text-muted-foreground">#{props.issue.id}</span>
	</div>
	{#if saveError !== null}
		<p class="text-sm text-destructive">{saveError}</p>
	{/if}
</form>
