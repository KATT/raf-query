<script setup lang="ts">
import { type Comment, currentUser } from "@examples/db/types";
import { Loader2 } from "@lucide/vue";
import {
	type QueryHandle,
	useQuery,
	useQueryClient,
} from "@raf-query/experimental-vue";
import { computed, ref } from "vue";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, parseResponse } from "@/lib/api.ts";
import { warnMockDbWrite } from "@/lib/mock-db-toast.ts";
import { commentsQuery } from "@/lib/queries.ts";

import CommentItem from "./CommentItem.vue";
import LoadMore from "./LoadMore.vue";

const props = defineProps<{
	readonly comments: QueryHandle<typeof commentsQuery>;
}>();
const queryClient = useQueryClient();
const comments = useQuery(commentsQuery, () => props.comments);
/** Posts that haven't saved yet, newest first. */
const posting = ref<ReadonlyArray<Comment>>([]);
const isPosting = ref(false);
const draft = ref("");

const loaded = computed(
	() => comments.data?.pages.flatMap((page) => page.comments) ?? [],
);
const confirmedIds = computed(
	() => new Set(loaded.value.map((comment) => comment.id)),
);
const shown = computed(() => [
	...posting.value.filter((comment) => !confirmedIds.value.has(comment.id)),
	...loaded.value,
]);
const lastPage = computed(() => comments.data?.pages.at(-1));
const total = computed(() => lastPage.value?.total ?? 0);
const displayTotal = computed(
	() => total.value + shown.value.length - loaded.value.length,
);
const firstPage = computed(
	() => new Set(comments.data?.pages[0]?.comments.map((comment) => comment.id)),
);
const skeletons = computed(() =>
	comments.isFetchingNextPage
		? Math.min(
				lastPage.value?.comments.length ?? 0,
				total.value - loaded.value.length,
			)
		: 0,
);

async function post() {
	const body = draft.value.trim();
	if (body === "") {
		return;
	}
	const issueId = props.comments.input.issueId;
	const id = crypto.randomUUID();
	warnMockDbWrite();
	draft.value = "";
	posting.value = [
		{
			author: currentUser,
			body,
			createdAt: new Date().toISOString(),
			id,
			issueId,
		},
		...posting.value,
	];
	isPosting.value = true;
	try {
		await parseResponse(
			api.issues[":id"].comments.$post({
				json: { body, id },
				param: { id: String(issueId) },
			}),
		);
		await queryClient.invalidate({ queryKey: ["issues"] });
	} finally {
		isPosting.value = false;
		posting.value = posting.value.filter((comment) => comment.id !== id);
	}
}
</script>

<template>
	<section v-if="comments.data" class="grid gap-4">
		<h2 class="font-semibold">
			{{ `${displayTotal} ${displayTotal === 1 ? "comment" : "comments"}` }}
		</h2>
		<form class="grid gap-2" @submit.prevent="post">
			<Textarea
				v-model="draft"
				:disabled="isPosting"
				name="body"
				placeholder="Add a comment"
				required
			/>
			<Button
				class="justify-self-end"
				:disabled="isPosting"
				type="submit"
				:variant="isPosting ? 'secondary' : 'default'"
			>
				<template v-if="isPosting">
					<Loader2 class="animate-spin" />
					Posting…
				</template>
				<template v-else>Comment</template>
			</Button>
		</form>
		<ol class="grid gap-3">
			<CommentItem
				v-for="comment in shown"
				:key="comment.id"
				:comment="comment"
				:fade-in="!firstPage.has(comment.id)"
				:pending="!confirmedIds.has(comment.id)"
			/>
			<li
				v-for="index in skeletons"
				:key="`skeleton-${index}`"
				class="rounded-lg border p-3"
			>
				<Skeleton class="mb-1 h-4 w-32" />
				<Skeleton class="h-5 w-full" />
			</li>
		</ol>
		<LoadMore
			v-if="comments.hasNextPage && !comments.isFetchingNextPage"
			@load="comments.fetchNextPage()"
		/>
	</section>
	<p v-else-if="comments.error" class="text-sm text-destructive">
		Couldn't load the comments.
	</p>
	<div v-else class="grid gap-3">
		<Skeleton class="h-6 w-32" />
		<Skeleton class="h-16" />
		<Skeleton class="h-16" />
	</div>
</template>
