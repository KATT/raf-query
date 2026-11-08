import { Skeleton } from "@examples/ui/components/skeleton";
import {
	group,
	infiniteQueryOptions,
	load,
	prefetch,
	type QueryClient,
	queryOptions,
	revalidate,
	swr,
	useInfiniteQuery,
	useQuery,
} from "@raf-query/react";
import {
	createRootRouteWithContext,
	createRoute,
	Link,
	type LinkComponentProps,
	type Router,
} from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { type ReactNode, Suspense, use, useId } from "react";

import { LoadMoreButton } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import {
	type Comment,
	type ListPage,
	pageOf,
	type Post,
	seedComments,
	seedPosts,
} from "~/demo-kit/fixtures.ts";
import { DemoRouter } from "~/demo-kit/router.tsx";
import { createFakeServer } from "~/demo-kit/server.ts";

const posts = group("posts");

/**
 * A blog's server and the factories that query it. Each variant gets its
 * own, so its Queries panel shows only its requests.
 */
function createBlog() {
	const server = createFakeServer(() => ({
		comments: seedComments(),
		posts: seedPosts(),
	}));
	return {
		commentsQuery: (input: { postId: number }) =>
			infiniteQueryOptions({
				queryFn: (context) =>
					server.respond(
						`GET /posts/${input.postId}/comments?cursor=${context.pageParam}`,
						(db) =>
							pageOf(
								db.comments.filter(
									(comment) => comment.postId === input.postId,
								),
								context.pageParam,
								2,
							),
						context,
					),
				// After `queryFn`: TypeScript infers the page type from it.
				getNextPageParam: (lastPage) => lastPage.nextCursor,
				initialPageParam: 0,
				queryKey: posts(input.postId, "comments"),
				staleTime: 5000,
			}),
		postQuery: (input: { id: number }) =>
			queryOptions({
				queryFn: (context) =>
					server.respond(
						`GET /posts/${input.id}`,
						(db) => db.posts.find((post) => post.id === input.id),
						context,
					),
				queryKey: posts(input.id),
				staleTime: 5000,
			}),
		postsQuery: () =>
			infiniteQueryOptions({
				queryFn: (context) =>
					server.respond(
						`GET /posts?cursor=${context.pageParam}`,
						(db) =>
							pageOf(
								db.posts.map((post): PostSummary => ({
									id: post.id,
									title: post.title,
								})),
								context.pageParam,
								3,
							),
						context,
					),
				// After `queryFn`: TypeScript infers the page type from it.
				getNextPageParam: (lastPage) => lastPage.nextCursor,
				initialPageParam: 0,
				queryKey: posts(),
				staleTime: 5000,
			}),
		server,
	};
}

interface RouterContext {
	readonly queryClient: QueryClient;
}

// The docs site registers its own router, so the hooks and links below name
// the demo's. Every variant's routes have the same paths.
type PrefetchRouter = Router<typeof prefetchTree>;
type SwrRouter = Router<typeof swrTree>;
type RevalidateRouter = Router<typeof revalidateTree>;

function BlogLink<const TTo extends string>(
	props: LinkComponentProps<"a", PrefetchRouter, string, TTo, string, "">,
) {
	return <Link<PrefetchRouter, string, TTo> {...props} />;
}

function PostSkeleton() {
	return (
		<div className="grid gap-2">
			<Skeleton className="h-6 w-2/3" />
			<Skeleton className="h-4 w-full" />
		</div>
	);
}

function PostBody(props: { readonly post: Post | undefined }) {
	return (
		<article className="grid gap-1">
			<h3 className="text-lg font-semibold">{props.post?.title}</h3>
			<p className="text-sm text-muted-foreground">{props.post?.body}</p>
		</article>
	);
}

function CommentsSection(props: { readonly children: ReactNode }) {
	const headingId = useId();
	return (
		<section aria-labelledby={headingId} className="grid gap-2 border-t pt-3">
			<h4
				className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
				id={headingId}
			>
				<MessageSquare className="size-3.5" /> Comments
			</h4>
			{props.children}
		</section>
	);
}

function CommentsSkeleton() {
	return (
		<div className="grid gap-3">
			{[0, 1].map((row) => (
				<div className="flex gap-2.5" key={row}>
					<Skeleton className="size-7 shrink-0 rounded-full" />
					<div className="grid flex-1 gap-1.5">
						<Skeleton className="h-3.5 w-16" />
						<Skeleton className="h-3.5 w-3/4" />
					</div>
				</div>
			))}
		</div>
	);
}

/** What a list needs from `useInfiniteQuery`'s state for its "Load more" button. */
interface ListControls {
	readonly fetchNextPage: () => Promise<void>;
	readonly hasNextPage: boolean;
	readonly isFetchingNextPage: boolean;
}

function CommentList(
	props: ListControls & {
		readonly pages: ReadonlyArray<ListPage<Comment>>;
	},
) {
	return (
		<div className="grid gap-3">
			<ul className="grid gap-3">
				{props.pages
					.flatMap((page) => page.items)
					.map((comment) => (
						<li className="flex gap-2.5 text-sm" key={comment.id}>
							<span
								aria-hidden="true"
								className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
							>
								{comment.author.charAt(0)}
							</span>
							<div className="grid gap-0.5">
								<span className="font-medium">{comment.author}</span>
								<p className="text-muted-foreground">{comment.body}</p>
							</div>
						</li>
					))}
			</ul>
			<LoadMoreButton
				fetchNextPage={props.fetchNextPage}
				hasNextPage={props.hasNextPage}
				isFetchingNextPage={props.isFetchingNextPage}
			/>
		</div>
	);
}

type PostSummary = Pick<Post, "id" | "title">;

function PostList(
	props: ListControls & {
		readonly pages: ReadonlyArray<ListPage<PostSummary>>;
	},
) {
	return (
		<div className="grid gap-2">
			<ul className="grid gap-1">
				{props.pages
					.flatMap((page) => page.items)
					.map((post) => (
						<li key={post.id}>
							<BlogLink
								className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent"
								params={{ id: String(post.id) }}
								to="/posts/$id"
							>
								{post.title}
							</BlogLink>
						</li>
					))}
			</ul>
			<LoadMoreButton
				fetchNextPage={props.fetchNextPage}
				hasNextPage={props.hasNextPage}
				isFetchingNextPage={props.isFetchingNextPage}
			/>
		</div>
	);
}

function PostListSkeleton() {
	return (
		<div className="grid gap-1">
			{[0, 1, 2].map((row) => (
				<Skeleton className="h-8 w-full" key={row} />
			))}
		</div>
	);
}

function PostPage(props: { readonly children: ReactNode }) {
	return (
		<div className="grid gap-4">
			<BlogLink
				className="text-xs text-muted-foreground hover:text-foreground"
				to="/posts"
			>
				← All posts
			</BlogLink>
			{props.children}
		</div>
	);
}

const prefetching = createBlog();
const prefetchRoot = createRootRouteWithContext<RouterContext>()();
const prefetchPost = createRoute({
	component: PrefetchedPost,
	getParentRoute: () => prefetchRoot,
	loader: async (args) => {
		const id = Number(args.params.id);
		const [handles] = await load(args.context.queryClient, {
			comments: prefetch(prefetching.commentsQuery, { postId: id }),
			post: prefetch(prefetching.postQuery, { id }),
		});
		return handles;
	},
	path: "/posts/$id",
});
const prefetchList = createRoute({
	component: PrefetchedList,
	getParentRoute: () => prefetchRoot,
	loader: async (args) => {
		const [handles] = await load(args.context.queryClient, {
			posts: prefetch(prefetching.postsQuery),
		});
		return handles.posts;
	},
	path: "/posts",
});
const prefetchTree = prefetchRoot.addChildren([prefetchList, prefetchPost]);

function PromisedList(
	props: ListControls & {
		readonly posts: Promise<{
			readonly pages: ReadonlyArray<ListPage<PostSummary>>;
		}>;
	},
) {
	const data = use(props.posts);
	return (
		<PostList
			fetchNextPage={props.fetchNextPage}
			hasNextPage={props.hasNextPage}
			isFetchingNextPage={props.isFetchingNextPage}
			pages={data.pages}
		/>
	);
}

function PrefetchedList(): ReactNode {
	const handle = prefetchList.useLoaderData<PrefetchRouter>();
	const [pagesThenable, postsState] = useInfiniteQuery(
		prefetching.postsQuery,
		handle,
	);
	return (
		<Suspense fallback={<PostListSkeleton />} key={postsState.hash}>
			<PromisedList
				fetchNextPage={postsState.fetchNextPage}
				hasNextPage={postsState.hasNextPage}
				isFetchingNextPage={postsState.isFetchingNextPage}
				posts={pagesThenable}
			/>
		</Suspense>
	);
}

function PromisedPost(props: { readonly post: Promise<Post | undefined> }) {
	const post = use(props.post);
	return <PostBody post={post} />;
}

function PrefetchedComments(): ReactNode {
	const data = prefetchPost.useLoaderData<PrefetchRouter>();
	const [pagesThenable, commentsState] = useInfiniteQuery(
		prefetching.commentsQuery,
		data.comments,
	);
	const pages = use(pagesThenable);
	return (
		<CommentList
			fetchNextPage={commentsState.fetchNextPage}
			hasNextPage={commentsState.hasNextPage}
			isFetchingNextPage={commentsState.isFetchingNextPage}
			pages={pages.pages}
		/>
	);
}

function PrefetchedPost(): ReactNode {
	const data = prefetchPost.useLoaderData<PrefetchRouter>();
	const [postThenable, postState] = useQuery(prefetching.postQuery, data.post);
	return (
		<PostPage>
			<Suspense fallback={<PostSkeleton />} key={postState.hash}>
				<PromisedPost post={postThenable} />
			</Suspense>
			<CommentsSection>
				<Suspense
					fallback={<CommentsSkeleton />}
					key={`${postState.hash}-comments`}
				>
					<PrefetchedComments />
				</Suspense>
			</CommentsSection>
		</PostPage>
	);
}

const swrBlog = createBlog();
const swrRoot = createRootRouteWithContext<RouterContext>()();
const swrPost = createRoute({
	component: SwrPost,
	getParentRoute: () => swrRoot,
	loader: async (args) => {
		const id = Number(args.params.id);
		const [handles] = await load(args.context.queryClient, {
			comments: swr(swrBlog.commentsQuery, { postId: id }),
			post: swr(swrBlog.postQuery, { id }),
		});
		return handles;
	},
	path: "/posts/$id",
});
const swrList = createRoute({
	component: SwrList,
	getParentRoute: () => swrRoot,
	loader: async (args) => {
		const [handles] = await load(args.context.queryClient, {
			posts: swr(swrBlog.postsQuery),
		});
		return handles.posts;
	},
	path: "/posts",
});
const swrTree = swrRoot.addChildren([swrList, swrPost]);

function SwrList(): ReactNode {
	const handle = swrList.useLoaderData<SwrRouter>();
	const [pagesThenable, postsState] = useInfiniteQuery(
		swrBlog.postsQuery,
		handle,
	);
	const pages = use(pagesThenable);
	return (
		<PostList
			fetchNextPage={postsState.fetchNextPage}
			hasNextPage={postsState.hasNextPage}
			isFetchingNextPage={postsState.isFetchingNextPage}
			pages={pages.pages}
		/>
	);
}

function SwrPost(): ReactNode {
	const data = swrPost.useLoaderData<SwrRouter>();
	const [postThenable] = useQuery(swrBlog.postQuery, data.post);
	const post = use(postThenable);
	const [commentsThenable, commentsState] = useInfiniteQuery(
		swrBlog.commentsQuery,
		data.comments,
	);
	const comments = use(commentsThenable);
	return (
		<PostPage>
			<PostBody post={post} />
			<CommentsSection>
				<CommentList
					fetchNextPage={commentsState.fetchNextPage}
					hasNextPage={commentsState.hasNextPage}
					isFetchingNextPage={commentsState.isFetchingNextPage}
					pages={comments.pages}
				/>
			</CommentsSection>
		</PostPage>
	);
}

const revalidateBlog = createBlog();
const revalidateRoot = createRootRouteWithContext<RouterContext>()();
const revalidatePost = createRoute({
	component: RevalidatedPost,
	getParentRoute: () => revalidateRoot,
	loader: async (args) => {
		const id = Number(args.params.id);
		const [handles] = await load(args.context.queryClient, {
			comments: revalidate(revalidateBlog.commentsQuery, { postId: id }),
			post: revalidate(revalidateBlog.postQuery, { id }),
		});
		return handles;
	},
	path: "/posts/$id",
});
const revalidateList = createRoute({
	component: RevalidatedList,
	getParentRoute: () => revalidateRoot,
	loader: async (args) => {
		const [handles] = await load(args.context.queryClient, {
			posts: revalidate(revalidateBlog.postsQuery),
		});
		return handles.posts;
	},
	path: "/posts",
});
const revalidateTree = revalidateRoot.addChildren([
	revalidateList,
	revalidatePost,
]);

function RevalidatedList(): ReactNode {
	const handle = revalidateList.useLoaderData<RevalidateRouter>();
	const [pagesThenable, postsState] = useInfiniteQuery(
		revalidateBlog.postsQuery,
		handle,
	);
	const pages = use(pagesThenable);
	return (
		<PostList
			fetchNextPage={postsState.fetchNextPage}
			hasNextPage={postsState.hasNextPage}
			isFetchingNextPage={postsState.isFetchingNextPage}
			pages={pages.pages}
		/>
	);
}

function RevalidatedPost(): ReactNode {
	const data = revalidatePost.useLoaderData<RevalidateRouter>();
	const [postThenable] = useQuery(revalidateBlog.postQuery, data.post);
	const post = use(postThenable);
	const [commentsThenable, commentsState] = useInfiniteQuery(
		revalidateBlog.commentsQuery,
		data.comments,
	);
	const comments = use(commentsThenable);
	return (
		<PostPage>
			<PostBody post={post} />
			<CommentsSection>
				<CommentList
					fetchNextPage={commentsState.fetchNextPage}
					hasNextPage={commentsState.hasNextPage}
					isFetchingNextPage={commentsState.isFetchingNextPage}
					pages={comments.pages}
				/>
			</CommentsSection>
		</PostPage>
	);
}

export default defineDemo({
	hint: "Open a post with each, then switch back and forth: each keeps its own page and queries. The requests start at the same moment every time. Go back and reopen the post after 5 seconds, once its cache is stale, to see swr and revalidate differ.",
	title: "prefetch, swr or revalidate",
	variants: [
		{
			Component: () => <DemoRouter initial="/posts" routeTree={prefetchTree} />,
			description: "Opens the post at once, with skeletons.",
			label: "prefetch",
			server: prefetching.server,
		},
		{
			Component: () => <DemoRouter initial="/posts" routeTree={swrTree} />,
			description:
				"Stays on the list until the post and its comments load. Cached data opens at once and refetches in the background.",
			label: "swr",
			server: swrBlog.server,
		},
		{
			Component: () => (
				<DemoRouter initial="/posts" routeTree={revalidateTree} />
			),
			description:
				"Stays on the list until the post and its comments load, and waits for the refetch whenever the cache is stale.",
			label: "revalidate",
			server: revalidateBlog.server,
		},
	],
	variantsLabel: "Load each page with",
});
