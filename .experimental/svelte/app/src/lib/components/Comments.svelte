<script lang="ts">
	import { type Comment, currentUser } from "@examples/db/types";
	import Loader2 from "@lucide/svelte/icons/loader-2";
	import {
		type QueryHandle,
		useQuery,
		useQueryClient,
	} from "@raf-query/experimental-svelte";

	import { api, parseResponse } from "#lib/api.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
	import { Textarea } from "#lib/components/ui/textarea/index.ts";
	import { warnMockDbWrite } from "#lib/mock-db-toast.ts";
	import { commentsQuery } from "#lib/queries.ts";

	import CommentItem from "./CommentItem.svelte";
	import LoadMore from "./LoadMore.svelte";

	const props: { readonly comments: QueryHandle<typeof commentsQuery> } =
		$props();
	const queryClient = useQueryClient();
	const comments = useQuery(commentsQuery, () => props.comments);
	/** Posts that haven't saved yet, newest first. */
	let posting = $state<ReadonlyArray<Comment>>([]);
	let isPosting = $state(false);

	const loaded = $derived(
		comments.data?.pages.flatMap((page) => page.comments) ?? [],
	);
	const confirmedIds = $derived(new Set(loaded.map((comment) => comment.id)));
	const shown = $derived([
		...posting.filter((comment) => !confirmedIds.has(comment.id)),
		...loaded,
	]);
	const lastPage = $derived(comments.data?.pages.at(-1));
	const total = $derived(lastPage?.total ?? 0);
	const displayTotal = $derived(total + shown.length - loaded.length);
	const firstPage = $derived(
		new Set(comments.data?.pages[0]?.comments.map((comment) => comment.id)),
	);

	async function post(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
		event.preventDefault();
		const form = event.currentTarget;
		const body = String(new FormData(form).get("body") ?? "").trim();
		if (body === "") {
			return;
		}
		const issueId = props.comments.input.issueId;
		const id = crypto.randomUUID();
		warnMockDbWrite();
		form.reset();
		posting = [
			{
				author: currentUser,
				body,
				createdAt: new Date().toISOString(),
				id,
				issueId,
			},
			...posting,
		];
		isPosting = true;
		try {
			await parseResponse(
				api.issues[":id"].comments.$post({
					json: { body, id },
					param: { id: String(issueId) },
				}),
			);
			await queryClient.invalidate({ queryKey: ["issues"] });
		} finally {
			isPosting = false;
			posting = posting.filter((comment) => comment.id !== id);
		}
	}
</script>

{#if comments.data}
	<section class="grid gap-4">
		<h2 class="font-semibold">
			{`${displayTotal} ${displayTotal === 1 ? "comment" : "comments"}`}
		</h2>
		<form class="grid gap-2" onsubmit={post}>
			<Textarea disabled={isPosting} name="body" placeholder="Add a comment" required />
			<Button
				class="justify-self-end"
				disabled={isPosting}
				type="submit"
				variant={isPosting ? "secondary" : "default"}
			>
				{#if isPosting}
					<Loader2 class="animate-spin" />
					Posting…
				{:else}
					Comment
				{/if}
			</Button>
		</form>
		<ol class="grid gap-3">
			{#each shown as comment (comment.id)}
				<CommentItem
					{comment}
					fadeIn={!firstPage.has(comment.id)}
					pending={!confirmedIds.has(comment.id)}
				/>
			{/each}
			{#if comments.isFetchingNextPage}
				{#each { length: Math.min(lastPage?.comments.length ?? 0, total - loaded.length) }, index (index)}
					<li class="rounded-lg border p-3">
						<Skeleton class="mb-1 h-4 w-32" />
						<Skeleton class="h-5 w-full" />
					</li>
				{/each}
			{/if}
		</ol>
		{#if comments.hasNextPage && !comments.isFetchingNextPage}
			<LoadMore onload={() => void comments.fetchNextPage()} />
		{/if}
	</section>
{:else if comments.error}
	<p class="text-sm text-destructive">Couldn't load the comments.</p>
{:else}
	<div class="grid gap-3">
		<Skeleton class="h-6 w-32" />
		<Skeleton class="h-16" />
		<Skeleton class="h-16" />
	</div>
{/if}
