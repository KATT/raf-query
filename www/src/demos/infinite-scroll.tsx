import { Skeleton } from "@examples/ui/components/skeleton";
import {
	group,
	load,
	prefetch,
	type QueryHandle,
	useInfiniteQuery,
} from "@raf-query/react";
import { use } from "react";

import { DemoBrowser, DemoLink } from "~/demo-kit/browser.tsx";
import { infiniteQueryOptions } from "~/demo-kit/client.ts";
import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

const posts = group("posts");

const postId = 1;

type Filter = "all" | "questions";

interface Comment {
	readonly author: string;
	readonly body: string;
	readonly id: number;
}

interface CommentPage {
	readonly items: ReadonlyArray<Comment>;
	readonly nextCursor: number | null;
}

const pageSize = 5;
const authors = ["Ada", "Grace", "Linus", "Margaret", "Ken", "Barbara"];
const bodies = [
	"Shipped the new loader today.",
	"Does prefetch block the navigation?",
	"The skeletons line up perfectly now.",
	"Why does my query refetch on focus?",
	"Moved the filter into the URL.",
	"Is staleTime per query or per read?",
	"Invalidation after the action fixed it.",
	"Can a component start a query?",
];

const server = createFakeServer(() => ({
	comments: Array.from({ length: 48 }, (_, index) => ({
		author: authors[index % authors.length] ?? "Ada",
		body: bodies[index % bodies.length] ?? "Hello.",
		id: index + 1,
	})),
}));

function commentsQuery(input: { readonly filter: Filter }) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /posts/${postId}/comments?filter=${input.filter}&cursor=${context.pageParam}`,
				(db): CommentPage => {
					const matching = db.comments.filter(
						(comment) => input.filter === "all" || comment.body.endsWith("?"),
					);
					const end = context.pageParam + pageSize;
					return {
						items: matching.slice(context.pageParam, end),
						nextCursor: end < matching.length ? end : null,
					};
				},
				context,
			),
		// After `queryFn`: TypeScript infers the page type from it.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: posts(postId, "comments", input),
		staleTime: 30_000,
	});
}

interface PageData {
	readonly comments: QueryHandle<typeof commentsQuery>;
}

function filterOf(value: number | string | undefined): Filter {
	return value === "questions" ? "questions" : "all";
}

function CommentSkeletons() {
	return Array.from({ length: pageSize }, (_, index) => (
		<li key={index}>
			<Skeleton className="h-12 w-full" />
		</li>
	));
}

function Comments(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}) {
	const [pagesThenable, commentsState] = useInfiniteQuery(
		commentsQuery,
		props.handle,
	);
	const data = use(pagesThenable);
	const items = data.pages.flatMap((page) => page.items);
	return (
		<div
			className="h-72 overflow-y-auto overscroll-contain rounded-md border p-2"
			data-scroll-root
		>
			<ul className="grid gap-1.5">
				{items.map((comment) => (
					<li
						className="rounded-md bg-muted/50 px-3 py-1.5 text-sm"
						key={comment.id}
					>
						<span className="mr-2 font-medium">{comment.author}</span>
						{comment.body}
						<span className="float-right font-mono text-xs text-muted-foreground">
							#{comment.id}
						</span>
					</li>
				))}
				{commentsState.isFetchingNextPage ? <CommentSkeletons /> : null}
			</ul>
			{commentsState.hasNextPage && !commentsState.isFetchingNextPage ? (
				<button
					className="mt-2 w-full rounded-md border py-1.5 text-xs text-muted-foreground hover:bg-accent"
					onClick={() => {
						void commentsState.fetchNextPage();
					}}
					ref={(button) => {
						if (button === null) {
							return;
						}
						const observer = new IntersectionObserver(
							(entries) => {
								if (entries.some((entry) => entry.isIntersecting)) {
									observer.disconnect();
									void commentsState.fetchNextPage();
								}
							},
							{
								root: button.closest("[data-scroll-root]"),
								rootMargin: "0px 0px 120px 0px",
							},
						);
						observer.observe(button);
						return () => {
							observer.disconnect();
						};
					}}
					type="button"
				>
					Load more
				</button>
			) : null}
			{commentsState.hasNextPage ? null : (
				<p className="py-2 text-center text-xs text-muted-foreground">
					That’s all {items.length} comments.
				</p>
			)}
		</div>
	);
}

function Page(props: { readonly data: PageData }) {
	return (
		<div className="grid gap-3">
			<nav className="flex gap-1 text-sm">
				{(["all", "questions"] satisfies ReadonlyArray<Filter>).map(
					(filter) => (
						<DemoLink
							className="rounded-md px-2.5 py-1 capitalize hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
							key={filter}
							to={{ path: `/posts/${postId}/comments`, search: { filter } }}
						>
							{filter}
						</DemoLink>
					),
				)}
			</nav>
			<Comments handle={props.data.comments} />
		</div>
	);
}

function InfiniteScroll() {
	return (
		<DemoBrowser
			fallback={
				<ul className="grid gap-1.5">
					<CommentSkeletons />
				</ul>
			}
			initial={{ path: `/posts/${postId}/comments`, search: { filter: "all" } }}
			loader={async (args): Promise<PageData> => {
				const [handles] = await load(args.client, {
					comments: prefetch(commentsQuery, {
						filter: filterOf(args.location.search?.filter),
					}),
				});
				return handles;
			}}
		>
			{(route) => <Page data={route.data} />}
		</DemoBrowser>
	);
}

export default defineDemo({
	Component: InfiniteScroll,
	hint: "Scroll the post's comments to load pages as you go. Switch the filter for a new list from its first page, then switch back: the old list is still cached with every page you loaded.",
	server,
	title: "Infinite scroll",
});
