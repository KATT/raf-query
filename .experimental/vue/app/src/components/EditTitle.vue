<script setup lang="ts">
// The issue title, editable in place. Click (or tab) into it, then Enter or
// blur to save; Escape cancels. Shows the new title while it saves.
import type { Issue } from "@examples/db/types";
import { useQueryClient } from "@raf-query/experimental-vue";
import { cn } from "cn";
import { computed, ref, useTemplateRef } from "vue";

import { api, parseResponse } from "@/lib/api.ts";
import { warnMockDbWrite } from "@/lib/mock-db-toast.ts";

const props = defineProps<{ readonly issue: Issue }>();
const queryClient = useQueryClient();
const optimistic = ref<string>();
const isSaving = ref(false);
const saveError = ref<string | null>(null);
const formRef = useTemplateRef("form");
const inputRef = useTemplateRef("input");
const title = computed(() => optimistic.value ?? props.issue.title);

async function save() {
	const form = formRef.value;
	if (!form) {
		return;
	}
	const issue = props.issue;
	const next = String(new FormData(form).get("title") ?? "").trim();
	if (next === issue.title) {
		saveError.value = null;
		return;
	}
	if (next === "") {
		saveError.value = "Title can't be empty";
		return;
	}
	saveError.value = null;
	warnMockDbWrite();
	optimistic.value = next;
	isSaving.value = true;
	try {
		await parseResponse(
			api.issues[":id"].$patch({
				json: { title: next },
				param: { id: String(issue.id) },
			}),
		);
		await queryClient.invalidate({ queryKey: ["issues"] });
	} catch (error) {
		saveError.value = error instanceof Error ? error.message : String(error);
	} finally {
		isSaving.value = false;
		optimistic.value = undefined;
	}
}

function onBlur() {
	const input = inputRef.value;
	if (!input) {
		return;
	}
	if (input.value.trim() === props.issue.title) {
		return;
	}
	input.form?.requestSubmit();
}

function onKeydown(event: KeyboardEvent) {
	const input = inputRef.value;
	if (!input) {
		return;
	}
	if (event.key === "Enter") {
		event.preventDefault();
		input.blur();
	}
	if (event.key === "Escape") {
		input.value = props.issue.title;
		input.blur();
	}
}
</script>

<template>
	<form ref="form" class="grid gap-1" @submit.prevent="save">
		<div class="flex items-baseline gap-2">
			<!-- `w-0`: the input's own width must not set the page's minimum width on phones. -->
			<input
				ref="input"
				aria-label="Title"
				:class="
					cn(
						'w-0 flex-1 rounded-md bg-transparent px-1.5 py-0.5 text-2xl font-semibold tracking-tight outline-none',
						'-mx-1.5 transition-[box-shadow,background-color]',
						'hover:bg-muted/60 focus:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50',
						isSaving && 'opacity-70',
					)
				"
				:disabled="isSaving"
				name="title"
				:value="title"
				@blur="onBlur"
				@keydown="onKeydown"
			/>
			<span class="shrink-0 text-lg text-muted-foreground"
				>#{{ props.issue.id }}</span
			>
		</div>
		<p v-if="saveError !== null" class="text-sm text-destructive">
			{{ saveError }}
		</p>
	</form>
</template>
