<!--
@component
One comment in the list. `pending` is a comment that hasn't saved yet;
`fadeIn` fades in a comment from a page loaded after the first.
-->
<script lang="ts">
	import type { Comment } from "@examples/db/types";

	import { cn } from "#lib/utils.ts";

	const props: {
		readonly comment: Comment;
		readonly fadeIn: boolean;
		readonly pending: boolean;
	} = $props();

	const timeFormat = new Intl.DateTimeFormat("en", {
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		month: "short",
	});
</script>

<li
	aria-busy={props.pending || undefined}
	class={cn(
		"rounded-lg border p-3",
		props.pending
			? "animate-pulse border-dashed bg-muted/40 text-muted-foreground"
			: props.fadeIn && "animate-in duration-500 fade-in",
	)}
>
	<div class="mb-1 flex gap-2 text-xs text-muted-foreground">
		<span
			class={cn(
				"font-medium",
				props.pending ? "text-muted-foreground" : "text-foreground",
			)}
		>
			{props.comment.author.name}
		</span>
		<time datetime={props.comment.createdAt}>
			{props.pending
				? "Posting…"
				: timeFormat.format(new Date(props.comment.createdAt))}
		</time>
	</div>
	<p class="text-sm">{props.comment.body}</p>
</li>
