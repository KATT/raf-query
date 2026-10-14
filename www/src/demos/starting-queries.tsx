import { Skeleton } from "@examples/ui/components/skeleton";
import {
	allKeyed,
	type EnsuredQueryHandle,
	type QueryHandle,
	queryOptions,
	type Thenable,
	useQuery,
} from "@raf-query/react";
import { MessageSquare } from "lucide-react";
import { type ReactNode, Suspense, use, useId } from "react";

import {
	DemoBrowser,
	type DemoLocation,
	DemoLink,
} from "~/demo-kit/browser.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import {
	type Comment,
	type Post,
	seedComments,
	seedPosts,
} from "~/demo-kit/fixtures.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

/**
 * A blog's server and the factories that query it. Each variant gets its
 * own, so its network panel shows only its requests.
 */
function createBlog() {
	const server = createFakeServer(() => ({
		comments: seedComments(),
		posts: seedPosts(),
	}));
	return {
		commentsQuery: (input: { postId: number }) =>
			queryOptions({
				queryFn: (context) =>
					server.respond(
						`GET /posts/${input.postId}/comments`,
						(db) =>
							db.comments.filter((comment) => comment.postId === input.postId),
						{ signal: context.signal },
					),
				queryKey: ["posts", input.postId, "comments"],
				staleTime: 10_000,
			}),
		postQuery: (input: { id: number }) =>
			queryOptions({
				queryFn: (context) =>
					server.respond(
						`GET /posts/${input.id}`,
						(db) => db.posts.find((post) => post.id === input.id),
						{ signal: context.signal },
					),
				queryKey: ["posts", input.id],
				staleTime: 10_000,
			}),
		server,
	};
}

function postIdOf(location: DemoLocation) {
	return Number(location.path.split("/")[2]);
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

function CommentList(props: { readonly comments: ReadonlyArray<Comment> }) {
	return (
		<ul className="grid gap-3">
			{props.comments.map((comment) => (
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
	);
}

function PostList() {
	return (
		<ul className="grid gap-1">
			{seedPosts()
				.slice(0, 4)
				.map((post) => (
					<li key={post.id}>
						<DemoLink
							className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent"
							to={{ path: `/posts/${post.id}` }}
						>
							{post.title}
						</DemoLink>
					</li>
				))}
		</ul>
	);
}

function PostPage(props: { readonly children: ReactNode }) {
	return (
		<div className="grid gap-4">
			<DemoLink
				className="text-xs text-muted-foreground hover:text-foreground"
				to={{ path: "/posts" }}
			>
				← All posts
			</DemoLink>
			{props.children}
		</div>
	);
}

const prefetching = createBlog();

type PrefetchedPage =
	| { readonly page: "list" }
	| {
			readonly comments: QueryHandle<typeof prefetching.commentsQuery>;
			readonly page: "post";
			readonly post: QueryHandle<typeof prefetching.postQuery>;
	  };

function PromisedPost(props: { readonly post: Thenable<Post | undefined> }) {
	return <PostBody post={use(props.post)} />;
}

function PrefetchedComments(props: {
	readonly handle: QueryHandle<typeof prefetching.commentsQuery>;
}) {
	const [commentsPromise] = useQuery(prefetching.commentsQuery, props.handle);
	return <CommentList comments={use(commentsPromise)} />;
}

function PrefetchedPost(props: {
	readonly comments: QueryHandle<typeof prefetching.commentsQuery>;
	readonly post: QueryHandle<typeof prefetching.postQuery>;
}) {
	const [postPromise, postState] = useQuery(prefetching.postQuery, props.post);
	return (
		<>
			<Suspense fallback={<PostSkeleton />} key={postState.hash}>
				<PromisedPost post={postPromise} />
			</Suspense>
			<CommentsSection>
				<Suspense
					fallback={<CommentsSkeleton />}
					key={`${postState.hash}-comments`}
				>
					<PrefetchedComments handle={props.comments} />
				</Suspense>
			</CommentsSection>
		</>
	);
}

function PrefetchDemo() {
	return (
		<DemoBrowser<PrefetchedPage>
			fallback={<PostSkeleton />}
			initial={{ path: "/posts" }}
			loader={(args) => {
				const id = postIdOf(args.location);
				if (!id) {
					return { page: "list" };
				}
				const qc = args.client;
				return {
					comments: qc.prefetch(prefetching.commentsQuery, { postId: id }),
					page: "post",
					post: qc.prefetch(prefetching.postQuery, { id }),
				};
			}}
		>
			{(route) =>
				route.data.page === "list" ? (
					<PostList />
				) : (
					<PostPage>
						<PrefetchedPost
							comments={route.data.comments}
							post={route.data.post}
						/>
					</PostPage>
				)
			}
		</DemoBrowser>
	);
}

const ensuring = createBlog();

type EnsuredPage =
	| { readonly page: "list" }
	| {
			readonly comments: EnsuredQueryHandle<typeof ensuring.commentsQuery>;
			readonly page: "post";
			readonly post: EnsuredQueryHandle<typeof ensuring.postQuery>;
	  };

function EnsuredPost(props: {
	readonly comments: EnsuredQueryHandle<typeof ensuring.commentsQuery>;
	readonly post: EnsuredQueryHandle<typeof ensuring.postQuery>;
}) {
	const [post] = useQuery(ensuring.postQuery, props.post);
	const [comments] = useQuery(ensuring.commentsQuery, props.comments);
	return (
		<>
			<PostBody post={post} />
			<CommentsSection>
				<CommentList comments={comments} />
			</CommentsSection>
		</>
	);
}

function EnsureDemo() {
	return (
		<DemoBrowser<EnsuredPage>
			fallback={<PostSkeleton />}
			initial={{ path: "/posts" }}
			loader={async (args) => {
				const id = postIdOf(args.location);
				if (!id) {
					return { page: "list" };
				}
				const qc = args.client;
				const handles = await allKeyed({
					comments: qc.ensure(ensuring.commentsQuery, { postId: id }),
					post: qc.ensure(ensuring.postQuery, { id }),
				});
				return { ...handles, page: "post" };
			}}
		>
			{(route) =>
				route.data.page === "list" ? (
					<PostList />
				) : (
					<PostPage>
						<EnsuredPost
							comments={route.data.comments}
							post={route.data.post}
						/>
					</PostPage>
				)
			}
		</DemoBrowser>
	);
}

export default defineDemo({
	hint: "Open a post with each, then switch back and forth: each keeps its own page and network log. The requests start at the same moment either way; only what you see while they load differs.",
	title: "prefetch vs ensure",
	variants: [
		{
			Component: PrefetchDemo,
			description: "Opens the post at once, with skeletons.",
			label: "prefetch",
			server: prefetching.server,
		},
		{
			Component: EnsureDemo,
			description: "Stays on the list until the post and its comments load.",
			label: "ensure",
			server: ensuring.server,
		},
	],
	variantsLabel: "Load the post and its comments with",
});
