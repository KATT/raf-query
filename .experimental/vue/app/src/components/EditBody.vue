<script setup lang="ts">
// The issue body, editable in place. Blur or Cmd/Ctrl+Enter saves; Escape
// cancels. Shows the new text while it saves.
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
const textareaRef = useTemplateRef("textarea");
const body = computed(() => optimistic.value ?? props.issue.body);

async function save() {
	const form = formRef.value;
	if (!form) {
		return;
	}
	const issue = props.issue;
	const next = String(new FormData(form).get("body") ?? "").trim();
	if (next === issue.body) {
		saveError.value = null;
		return;
	}
	if (next === "") {
		saveError.value = "Description can't be empty";
		return;
	}
	saveError.value = null;
	warnMockDbWrite();
	optimistic.value = next;
	isSaving.value = true;
	try {
		await parseResponse(
			api.issues[":id"].$patch({
				json: { body: next },
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
	const textarea = textareaRef.value;
	if (!textarea) {
		return;
	}
	if (textarea.value.trim() === props.issue.body) {
		return;
	}
	textarea.form?.requestSubmit();
}

function onKeydown(event: KeyboardEvent) {
	const textarea = textareaRef.value;
	if (!textarea) {
		return;
	}
	if (event.key === "Escape") {
		textarea.value = props.issue.body;
		textarea.blur();
	}
	if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
		event.preventDefault();
		textarea.blur();
	}
}
</script>

<template>
	<form ref="form" class="grid gap-1" @submit.prevent="save">
		<textarea
			ref="textarea"
			aria-label="Description"
			:class="
				cn(
					'min-h-28 w-full resize-y rounded-md bg-transparent px-1.5 py-1 text-sm whitespace-pre-line outline-none',
					'-mx-1.5 transition-[box-shadow,background-color]',
					'hover:bg-muted/60 focus:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50',
					isSaving && 'opacity-70',
				)
			"
			:disabled="isSaving"
			name="body"
			:rows="5"
			:value="body"
			@blur="onBlur"
			@keydown="onKeydown"
		></textarea>
		<p v-if="saveError !== null" class="text-sm text-destructive">
			{{ saveError }}
		</p>
	</form>
</template>
