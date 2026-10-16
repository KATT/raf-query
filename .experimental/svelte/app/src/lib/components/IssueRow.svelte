<!--
@component
An issue row's contents, for inside its link. `children` (the status
control) sits in a span that cancels clicks, so using it doesn't navigate.
-->
<script lang="ts">
	import type { Issue } from "@examples/db/types";
	import MessageSquare from "@lucide/svelte/icons/message-square";
	import type { Snippet } from "svelte";

	const props: { readonly children: Snippet; readonly issue: Issue } = $props();

	const dateFormat = new Intl.DateTimeFormat("en", {
		day: "numeric",
		month: "short",
	});
	const cancel = (event: MouseEvent) => {
		event.preventDefault();
	};
</script>

<span class="w-10 shrink-0 text-sm text-muted-foreground">#{props.issue.id}</span>
<!-- `w-0`: the full title must not set the row's minimum width on phones. -->
<span class="w-0 flex-1 truncate font-medium">{props.issue.title}</span>
<span class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground max-sm:hidden">
	<MessageSquare class="size-3" />
	{props.issue.commentCount}
</span>
<span class="w-14 shrink-0 text-right text-xs text-muted-foreground max-sm:hidden">
	{dateFormat.format(new Date(props.issue.createdAt))}
</span>
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<span class="shrink-0" onauxclick={cancel} onclick={cancel}>
	{@render props.children()}
</span>
