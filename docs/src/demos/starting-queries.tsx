import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	type EnsuredQueryHandle,
	type QueryHandle,
	queryOptions,
	type Thenable,
	useQuery,
} from "@raf-query/react";
import { Suspense, use, useState } from "react";

import { DemoBrowser, type DemoLoader, DemoLink } from "~/demo-kit/browser.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { type Post, seedComments, seedPosts } from "~/demo-kit/fixtures.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

const server = createFakeServer(() => ({
	comments: seedComments(),
	posts: seedPosts(),
}));

function postQuery(input: { id: number }) {
	return queryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /posts/${input.id}`,
				(db) => db.posts.find((post) => post.id === input.id),
				{ signal: context.signal },
			),
		queryKey: ["posts", input.id],
		staleTime: 10_000,
	});
}

function commentsQuery(input: { postId: number }) {
	return queryOptions({
		queryFn: () =>
			server.respond(`GET /posts/${input.postId}/comments`, (db) =>
				db.comments.filter((comment) => comment.postId === input.postId),
			),
		queryKey: ["posts", input.postId, "comments"],
		staleTime: 10_000,
	});
}

type Mode = "ensure" | "prefetch";

type PageData =
	| { readonly page: "list" }
	| {
			readonly comments: QueryHandle<typeof commentsQuery>;
			readonly page: "ensured";
			readonly post: EnsuredQueryHandle<typeof postQuery>;
	  }
	| {
			readonly comments: QueryHandle<typeof commentsQuery>;
			readonly page: "prefetched";
			readonly post: QueryHandle<typeof postQuery>;
	  };

function loaderFor(mode: Mode): DemoLoader<PageData> {
	return async (args) => {
		const id = Number(args.location.path.split("/")[2]);
		if (!id) {
			return { page: "list" };
		}
		const qc = args.client;
		const comments = qc.prefetch(commentsQuery, { postId: id });
		if (mode === "prefetch") {
			return {
				comments,
				page: "prefetched",
				post: qc.prefetch(postQuery, { id }),
			};
		}
		return {
			comments,
			page: "ensured",
			post: await qc.ensure(postQuery, { id }),
		};
	};
}

function PostSkeleton() {
	return (
		<div className="grid gap-2">
			<Skeleton className="h-6 w-2/3" />
			<Skeleton className="h-4 w-full" />
		</div>
	);
}

function CommentsSkeleton() {
	return (
		<div className="grid gap-2">
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-10 w-full" />
		</div>
	);
}

function PostBody(props: { readonly post: Post | undefined }) {
	return (
		<div className="grid gap-1">
			<h3 className="text-lg font-semibold">{props.post?.title}</h3>
			<p className="text-sm text-muted-foreground">{props.post?.body}</p>
		</div>
	);
}

function PromisedPost(props: { readonly post: Thenable<Post | undefined> }) {
	return <PostBody post={use(props.post)} />;
}

function Comments(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}) {
	const [commentsPromise] = useQuery(commentsQuery, props.handle);
	const comments = use(commentsPromise);
	return (
		<ul className="grid gap-2">
			{comments.map((comment) => (
				<li className="rounded-md border px-3 py-2 text-sm" key={comment.id}>
					<span className="mr-2 font-medium">{comment.author}</span>
					{comment.body}
				</li>
			))}
		</ul>
	);
}

function EnsuredPost(props: {
	readonly comments: QueryHandle<typeof commentsQuery>;
	readonly post: EnsuredQueryHandle<typeof postQuery>;
}) {
	const [post] = useQuery(postQuery, props.post);
	return (
		<>
			<PostBody post={post} />
			<Suspense fallback={<CommentsSkeleton />} key={post?.id}>
				<Comments handle={props.comments} />
			</Suspense>
		</>
	);
}

function PrefetchedPost(props: {
	readonly comments: QueryHandle<typeof commentsQuery>;
	readonly post: QueryHandle<typeof postQuery>;
}) {
	const [postPromise, postState] = useQuery(postQuery, props.post);
	return (
		<>
			<Suspense fallback={<PostSkeleton />} key={postState.hash}>
				<PromisedPost post={postPromise} />
			</Suspense>
			<Suspense
				fallback={<CommentsSkeleton />}
				key={`${postState.hash}-comments`}
			>
				<Comments handle={props.comments} />
			</Suspense>
		</>
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

function Page(props: { readonly data: PageData }) {
	const data = props.data;
	if (data.page === "list") {
		return <PostList />;
	}
	return (
		<div className="grid gap-4">
			<DemoLink
				className="text-xs text-muted-foreground hover:text-foreground"
				to={{ path: "/posts" }}
			>
				← All posts
			</DemoLink>
			{data.page === "ensured" ? (
				<EnsuredPost comments={data.comments} post={data.post} />
			) : (
				<PrefetchedPost comments={data.comments} post={data.post} />
			)}
		</div>
	);
}

const modes: ReadonlyArray<{ readonly label: string; readonly value: Mode }> = [
	{ label: "prefetch the post", value: "prefetch" },
	{ label: "ensure the post", value: "ensure" },
];

function StartingQueries() {
	const [mode, setMode] = useState<Mode>("prefetch");
	return (
		<div className="grid gap-3">
			<fieldset className="flex flex-wrap items-center gap-2 text-sm">
				<legend className="sr-only">Loader</legend>
				<span className="text-muted-foreground">The loader should</span>
				{modes.map((option) => (
					<label
						className={cn(
							"cursor-pointer rounded-md border px-2.5 py-1 font-mono text-xs",
							mode === option.value && "border-foreground bg-accent",
						)}
						key={option.value}
					>
						<input
							checked={mode === option.value}
							className="sr-only"
							name="mode"
							onChange={() => {
								setMode(option.value);
							}}
							type="radio"
						/>
						{option.label}
					</label>
				))}
				<span className="text-muted-foreground">
					and prefetch its comments.
				</span>
			</fieldset>
			<DemoBrowser
				fallback={<PostSkeleton />}
				initial={{ path: "/posts" }}
				loader={loaderFor(mode)}
			>
				{(route) => <Page data={route.data} />}
			</DemoBrowser>
		</div>
	);
}

export default defineDemo({
	Component: StartingQueries,
	hint: "Open a post with each loader. Prefetch commits at once and shows skeletons; ensure keeps the list on screen until the post is in. Both requests start together either way.",
	server,
	title: "prefetch vs ensure",
});
