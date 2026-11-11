import { use } from "react";
import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import {
	group,
	invalidateOne,
	load,
	type QueryHandle,
	swr,
	useInfiniteQuery,
} from "@raf-query/react";
import { RefreshCw, RotateCcw } from "lucide-react";

import { DemoBrowser, DemoLink } from "~/demo-kit/browser.tsx";
import { infiniteQueryOptions, useQueryClient } from "~/demo-kit/client.ts";
import { formatTime, LoadMoreButton, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { pageOf, seedComments } from "~/demo-kit/fixtures.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

const posts = group("posts");

/** The post on screen: the one with five comments. */
const postId = 3;

const server = createFakeServer(() => ({ comments: seedComments() }));

function commentsQuery(input: { readonly postId: number }) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /posts/${input.postId}/comments?cursor=${context.pageParam}`,
				(db) =>
					pageOf(
						db.comments.filter((comment) => comment.postId === input.postId),
						context.pageParam,
						3,
					),
				context,
			),
		// After `queryFn`: TypeScript infers the page type from it.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: posts(input.postId, "comments"),
		staleTime: 60_000,
	});
}

type PageData =
	| {
			readonly comments: QueryHandle<typeof commentsQuery>;
			readonly page: "post";
	  }
	| { readonly page: "about" };

function Comments(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}) {
	const queryClient = useQueryClient();
	const [pagesThenable, commentsState] = useInfiniteQuery(
		commentsQuery,
		props.handle,
	);
	const pages = use(pagesThenable);
	const comments = pages.pages.flatMap((page) => page.items);
	return (
		<div aria-busy={commentsState.isFetching} className="grid gap-3">
			<ul className="grid gap-1.5">
				{comments.map((comment) => (
					<li
						className="flex gap-3 rounded-md border px-3 py-1.5 text-sm"
						key={comment.id}
					>
						<span className="w-16 shrink-0 font-medium">{comment.author}</span>
						{comment.body}
					</li>
				))}
			</ul>
			<LoadMoreButton
				fetchNextPage={commentsState.fetchNextPage}
				hasNextPage={commentsState.hasNextPage}
				isFetchingNextPage={commentsState.isFetchingNextPage}
			/>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					disabled={commentsState.isFetching}
					onClick={() => {
						void commentsState.refetch();
					}}
					size="xs"
					variant="outline"
				>
					<RefreshCw /> Refetch
				</Button>
				<Button
					onClick={() => {
						void invalidateOne(queryClient, commentsQuery, { postId });
					}}
					size="xs"
					variant="outline"
				>
					<RotateCcw /> Invalidate
				</Button>
				<span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
					{commentsState.isFetching ? <Spinner /> : null}
					Fetched at {formatTime(commentsState.updatedAt)}
				</span>
			</div>
		</div>
	);
}

function Page(props: { readonly data: PageData }) {
	const data = props.data;
	return (
		<div className="grid gap-4">
			<nav className="flex gap-1 text-sm">
				{[
					{ label: "Post", path: `/posts/${postId}` },
					{ label: "About", path: "/about" },
				].map((link) => (
					<DemoLink
						className="rounded-md px-2.5 py-1 hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
						key={link.path}
						to={{ path: link.path }}
					>
						{link.label}
					</DemoLink>
				))}
			</nav>
			{data.page === "post" ? (
				<Comments handle={data.comments} />
			) : (
				<p className="text-sm text-muted-foreground">
					Nothing on this page reads the comments.
				</p>
			)}
		</div>
	);
}

function Cancellation() {
	return (
		<DemoBrowser
			fallback={<Skeleton className="h-28 w-full" />}
			initial={{ path: `/posts/${postId}` }}
			loader={async (args): Promise<PageData> => {
				if (args.location.path !== `/posts/${postId}`) {
					return { page: "about" };
				}
				const [handles] = await load(args.client, {
					comments: swr(commentsQuery, { postId }),
				});
				return { comments: handles.comments, page: "post" };
			}}
		>
			{(route) => <Page data={route.data} />}
		</DemoBrowser>
	);
}

export default defineDemo({
	Component: Cancellation,
	hint: "Pick Slow and press Refetch, then Invalidate before it lands: the request in flight is aborted and a new one starts. Refetch and open About instead: the request runs to the end, and the comments are cached when you come back.",
	server,
	title: "Aborting requests that were replaced",
});
