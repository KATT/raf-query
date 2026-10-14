import { currentUser } from "@examples/db/types";
import { Button } from "@examples/ui/components/button";
import { LoadMore } from "@examples/ui/components/load-more";
import { Skeleton } from "@examples/ui/components/skeleton";
import { Textarea } from "@examples/ui/components/textarea";
import { warnMockDbWrite } from "@examples/ui/lib/mock-db-toast";
import { cn } from "@examples/ui/lib/utils";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { useRouteContext } from "@tanstack/react-router";
import { Effect } from "effect";
import { Loader2 } from "lucide-react";
import { use, useOptimistic, useRef } from "react";
import { useFormStatus } from "react-dom";

import { Issues } from "~/issues.ts";
import { commentsQuery, invalidateIssues } from "~/queries.ts";
import type { Comment } from "~/rpc.ts";

/**
 * Saves the comment, then waits for the refetched comments. A failure
 * rejects, so the form's action throws to the nearest error boundary.
 */
const addComment = Effect.fn("addComment")(function* (input: {
	readonly body: string;
	readonly id: string;
	readonly issueId: number;
}) {
	const issues = yield* Issues;
	yield* issues.AddComment(input);
	yield* invalidateIssues;
});

const commentClassName = "rounded-lg border p-3";

const timeFormat = new Intl.DateTimeFormat("en", {
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	month: "short",
});

export function Comments(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}) {
	const queryClient = useRouteContext({
		from: "__root__",
		select: (context) => context.queryClient,
	});
	const formRef = useRef<HTMLFormElement>(null);
	const [pagesPromise, comments] = useQuery(commentsQuery, props.handle, {
		throwOnError: true,
	});
	const pages = use(pagesPromise);
	const issueId = props.handle.input.issueId;
	const loaded = pages.pages.flatMap((page) => page.comments);
	const confirmedIds = new Set(loaded.map((comment) => comment.id));
	const [shown, addOptimistic] = useOptimistic<ReadonlyArray<Comment>, Comment>(
		loaded,
		(current, comment) =>
			current.some((existing) => existing.id === comment.id)
				? current
				: [comment, ...current],
	);
	const lastPage = pages.pages.at(-1);
	const total = lastPage?.total ?? 0;
	const pendingCount = shown.filter(
		(comment) => !confirmedIds.has(comment.id),
	).length;
	const displayTotal = total + pendingCount;
	const firstPage = new Set(
		pages.pages[0]?.comments.map((comment) => comment.id),
	);

	return (
		<section className="grid gap-4">
			<h2 className="font-semibold">
				{displayTotal} {displayTotal === 1 ? "comment" : "comments"}
			</h2>
			<form
				action={async (formData) => {
					const body = String(formData.get("body") ?? "").trim();
					if (body === "") {
						return;
					}
					const id = crypto.randomUUID();
					warnMockDbWrite();
					formRef.current?.reset();
					addOptimistic({
						author: currentUser,
						body,
						createdAt: new Date().toISOString(),
						id,
						issueId,
					});
					await queryClient.runPromise(addComment({ body, id, issueId }));
				}}
				className="grid gap-2"
				ref={formRef}
			>
				<CommentComposer />
			</form>
			<ol className="grid gap-3">
				{shown.map((comment) => {
					const pending = !confirmedIds.has(comment.id);
					return (
						<li
							aria-busy={pending || undefined}
							className={cn(
								commentClassName,
								pending
									? "animate-pulse border-dashed bg-muted/40 text-muted-foreground"
									: !firstPage.has(comment.id) &&
											"animate-in duration-500 fade-in",
							)}
							key={comment.id}
						>
							<div className="mb-1 flex gap-2 text-xs text-muted-foreground">
								<span
									className={cn(
										"font-medium",
										pending ? "text-muted-foreground" : "text-foreground",
									)}
								>
									{comment.author.name}
								</span>
								<time dateTime={comment.createdAt}>
									{pending
										? "Posting…"
										: timeFormat.format(new Date(comment.createdAt))}
								</time>
							</div>
							<p className="text-sm">{comment.body}</p>
						</li>
					);
				})}
				{comments.isFetchingNextPage ? (
					<CommentSkeletons
						count={Math.min(
							lastPage?.comments.length ?? 0,
							total - loaded.length,
						)}
					/>
				) : null}
			</ol>
			{comments.hasNextPage && !comments.isFetchingNextPage ? (
				<LoadMore
					onLoad={() => {
						void comments.fetchNextPage();
					}}
				/>
			) : null}
		</section>
	);
}

function CommentComposer() {
	const { pending } = useFormStatus();
	return (
		<>
			<Textarea
				disabled={pending}
				name="body"
				placeholder="Add a comment"
				required
			/>
			<Button
				className="justify-self-end"
				disabled={pending}
				type="submit"
				variant={pending ? "secondary" : "default"}
			>
				{pending ? <Loader2 className="animate-spin" /> : null}
				{pending ? "Posting…" : "Comment"}
			</Button>
		</>
	);
}

function CommentSkeletons(props: { readonly count: number }) {
	return Array.from({ length: props.count }, (_, index) => (
		<li className={commentClassName} key={index}>
			<Skeleton className="mb-1 h-4 w-32" />
			<Skeleton className="h-5 w-full" />
		</li>
	));
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
