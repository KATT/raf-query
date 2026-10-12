import type { Comment } from "@examples/db/types";
import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import { Textarea } from "@examples/ui/components/textarea";
import { type QueryHandle, useQuery, useQueryClient } from "@raf-query/react";
import { Suspense, use, useOptimistic } from "react";

import { commentsQuery } from "~/queries.ts";
import { addComment } from "~/server-functions.ts";

import { UserName } from "./user.tsx";

const timeFormat = new Intl.DateTimeFormat("en", {
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	month: "short",
});

export function Comments(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}) {
	const queryClient = useQueryClient();
	const [pagesPromise, comments] = useQuery(commentsQuery, props.handle);
	const pages = use(pagesPromise);
	const issueId = props.handle.input.issueId;
	const loaded = pages.pages.flatMap((page) => page.comments);
	const [shown, addOptimistic] = useOptimistic<ReadonlyArray<Comment>, Comment>(
		loaded,
		(current, comment) => [...current, comment],
	);
	const total = pages.pages.at(-1)?.total ?? 0;

	return (
		<section className="grid gap-4">
			<h2 className="font-semibold">
				{total} {total === 1 ? "comment" : "comments"}
			</h2>
			<ol className="grid gap-3">
				{shown.map((comment) => (
					<li className="rounded-lg border p-3" key={comment.id}>
						<div className="mb-1 flex gap-2 text-xs text-muted-foreground">
							<span className="font-medium text-foreground">
								<Suspense fallback="…">
									<UserName userId={comment.authorId} />
								</Suspense>
							</span>
							<time dateTime={comment.createdAt}>
								{timeFormat.format(new Date(comment.createdAt))}
							</time>
						</div>
						<p className="text-sm">{comment.body}</p>
					</li>
				))}
			</ol>
			{comments.hasNextPage ? (
				<Button
					disabled={comments.isFetchingNextPage}
					onClick={() => {
						void comments.fetchNextPage();
					}}
					variant="outline"
				>
					{comments.isFetchingNextPage ? "Loading…" : "Load more"}
				</Button>
			) : null}
			<form
				action={async (formData) => {
					const body = String(formData.get("body") ?? "");
					addOptimistic({
						authorId: "ada",
						body,
						createdAt: new Date().toISOString(),
						id: -Date.now(),
						issueId,
					});
					await addComment({ data: { body, issueId } });
					await queryClient.invalidate({ queryKey: ["issues"] });
				}}
				className="grid gap-2"
			>
				<Textarea name="body" placeholder="Add a comment" required />
				<Button className="justify-self-end" type="submit">
					Comment
				</Button>
			</form>
		</section>
	);
}

export function CommentsSkeleton() {
	return (
		<div className="grid gap-3">
			<Skeleton className="h-6 w-32" />
			<Skeleton className="h-16" />
			<Skeleton className="h-16" />
		</div>
	);
}
