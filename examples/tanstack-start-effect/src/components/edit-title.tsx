import { Button } from "@examples/ui/components/button";
import { Input } from "@examples/ui/components/input";
import { QueryCache } from "@raf-query/react";
import { useRouteContext } from "@tanstack/react-router";
import { Effect } from "effect";
import { useActionState, useOptimistic } from "react";

import { Issues } from "~/issues.ts";
import type { Issue } from "~/rpc.ts";

/** Saves the title, then waits for the refetched issue. `null` when it saved. */
const rename = Effect.fn("rename")(
	function* (input: { readonly id: number; readonly title: string }) {
		const issues = yield* Issues;
		const cache = yield* QueryCache.QueryCache;
		yield* issues.UpdateTitle(input);
		yield* cache.invalidate({ queryKey: ["issues"] });
		return null;
	},
	Effect.catchTags({
		// Every failure `UpdateTitle` declares, so this Effect can't fail.
		EmptyTitle: () => Effect.succeed("Title can't be empty"),
		RpcClientError: (error) => Effect.succeed(error.message),
	}),
);

/** The issue's title, editable in place. Shows the new title while it saves. */
export function EditTitle(props: { readonly issue: Issue }) {
	const queryClient = useRouteContext({
		from: "__root__",
		select: (context) => context.queryClient,
	});
	const issue = props.issue;
	const [title, setOptimisticTitle] = useOptimistic(issue.title);
	const [saveError, save, isSaving] = useActionState<string | null, FormData>(
		(_previous, formData) => {
			const next = String(formData.get("title") ?? "");
			setOptimisticTitle(next);
			return queryClient.runPromise(rename({ id: issue.id, title: next }));
		},
		null,
	);

	return (
		<div className="grid gap-3">
			<h1 className="text-2xl font-semibold">
				{title} <span className="text-muted-foreground">#{issue.id}</span>
			</h1>
			<form action={save} className="flex gap-2">
				<Input
					aria-label="Title"
					defaultValue={issue.title}
					key={issue.title}
					name="title"
				/>
				<Button disabled={isSaving} type="submit" variant="secondary">
					{isSaving ? "Saving…" : "Rename"}
				</Button>
			</form>
			{saveError === null ? null : (
				<p className="text-sm text-destructive">{saveError}</p>
			)}
		</div>
	);
}
