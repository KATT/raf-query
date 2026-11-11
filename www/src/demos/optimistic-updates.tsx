import { Button } from "@examples/ui/components/button";
import { Input } from "@examples/ui/components/input";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	group,
	invalidateMany,
	load,
	type QueryHandle,
	swr,
	useInfiniteQuery,
	useQuery,
} from "@raf-query/react";
import { useActionState, useOptimistic, use } from "react";
import { useFormStatus } from "react-dom";

import { DemoBrowser } from "~/demo-kit/browser.tsx";
import {
	infiniteQueryOptions,
	queryOptions,
	useQueryClient,
} from "~/demo-kit/client.ts";
import {
	FailNextButton,
	LoadMoreButton,
	Spinner,
} from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import {
	type Comment,
	pageOf,
	seedComments,
	seedPosts,
} from "~/demo-kit/fixtures.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

const posts = group("posts");
const comments = group(posts, "comments");

const postId = 1;

/** A comment the server hasn't confirmed yet. */
type ShownComment = Comment & { readonly pending?: boolean };

const server = createFakeServer(() => ({
	// Newest first, so a new comment lands on the first page.
	comments: seedComments()
		.filter((comment) => comment.postId === postId)
		.toReversed(),
	posts: seedPosts(),
}));

function postQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /posts/${input.id}`,
				(db) => db.posts.find((post) => post.id === input.id),
				context,
			),
		queryKey: posts(input.id),
	});
}

function commentsQuery(input: { readonly postId: number }) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /posts/${input.postId}/comments?cursor=${context.pageParam}`,
				(db) =>
					pageOf<ShownComment>(
						db.comments.filter((comment) => comment.postId === input.postId),
						context.pageParam,
						2,
					),
				context,
			),
		// After `queryFn`: TypeScript infers the page type from it.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: comments(input.postId),
	});
}

function addComment(input: { readonly body: string; readonly postId: number }) {
	return server.respond(
		`POST /posts/${input.postId}/comments "${input.body}"`,
		(db) => {
			const comment: Comment = {
				author: "You",
				body: input.body,
				id: Math.max(0, ...db.comments.map((item) => item.id)) + 1,
				postId: input.postId,
			};
			db.comments.unshift(comment);
			return comment;
		},
	);
}

interface PageData {
	readonly comments: QueryHandle<typeof commentsQuery>;
	readonly post: QueryHandle<typeof postQuery>;
}

function SubmitButton() {
	const status = useFormStatus();
	return (
		<Button disabled={status.pending} size="sm" type="submit">
			{status.pending ? <Spinner className="text-current" /> : null}
			Add
		</Button>
	);
}

function PostTitle(props: { readonly handle: QueryHandle<typeof postQuery> }) {
	const [postThenable] = useQuery(postQuery, props.handle);
	const post = use(postThenable);
	return <h3 className="text-lg font-semibold">{post?.title}</h3>;
}

function Comments(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}) {
	const queryClient = useQueryClient();
	const [pagesThenable, commentsState] = useInfiniteQuery(
		commentsQuery,
		props.handle,
	);
	const pages = use(pagesThenable);
	const serverComments = pages.pages.flatMap((page) => page.items);
	const [shownComments, addOptimistic] = useOptimistic<
		ReadonlyArray<ShownComment>,
		string
	>(serverComments, (current, body) => [
		{ author: "You", body, id: -current.length - 1, pending: true, postId },
		...current,
	]);
	const [message, formAction] = useActionState<string | null, FormData>(
		async (_previous, formData) => {
			const body = String(formData.get("body")).trim();
			if (!body) {
				return "Write something first.";
			}
			addOptimistic(body);
			try {
				await addComment({ body, postId });
			} catch (error) {
				return error instanceof Error ? error.message : "Something went wrong";
			}
			await invalidateMany(queryClient, [[commentsQuery, { postId }]]);
			return null;
		},
		null,
	);

	return (
		<div className="grid gap-3">
			<ul className="grid gap-1.5">
				{shownComments.map((comment) => (
					<li
						className={cn(
							"flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm",
							comment.pending && "border-dashed text-muted-foreground",
						)}
						key={comment.id}
					>
						<span>
							<span className="mr-2 font-medium">{comment.author}</span>
							{comment.body}
						</span>
						{comment.pending ? (
							<span className="flex shrink-0 items-center gap-1.5 text-xs">
								<Spinner /> saving
							</span>
						) : null}
					</li>
				))}
			</ul>
			<LoadMoreButton
				fetchNextPage={commentsState.fetchNextPage}
				hasNextPage={commentsState.hasNextPage}
				isFetchingNextPage={commentsState.isFetchingNextPage}
			/>
			<form action={formAction} className="flex gap-2">
				<Input
					aria-label="New comment"
					name="body"
					placeholder="Add a comment"
				/>
				<SubmitButton />
			</form>
			{message ? (
				<p className="text-sm text-destructive" role="alert">
					{message}
				</p>
			) : null}
		</div>
	);
}

function OptimisticUpdates() {
	return (
		<div className="grid gap-3">
			<div>
				<FailNextButton server={server} />
			</div>
			<DemoBrowser
				fallback={<Skeleton className="h-32 w-full" />}
				initial={{ path: `/posts/${postId}` }}
				loader={async (args): Promise<PageData> => {
					const [handles] = await load(args.client, {
						comments: swr(commentsQuery, { postId }),
						post: swr(postQuery, { id: postId }),
					});
					return handles;
				}}
			>
				{(route) => (
					<div className="grid gap-3">
						<PostTitle handle={route.data.post} />
						<Comments handle={route.data.comments} />
					</div>
				)}
			</DemoBrowser>
		</div>
	);
}

export default defineDemo({
	Component: OptimisticUpdates,
	hint: "Add a comment: it appears at once, dashed and marked saving, until the server confirms and the comments refetch. Make the next request fail to watch it roll back on its own.",
	server,
	title: "Optimistic updates with useOptimistic",
});
