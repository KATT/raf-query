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

const modes: ReadonlyArray<{
	readonly description: string;
	readonly value: Mode;
}> = [
	{
		description: "Opens the post at once, with skeletons.",
		value: "prefetch",
	},
	{
		description: "Stays on the list until the post loads.",
		value: "ensure",
	},
];

function StartingQueries() {
	const [mode, setMode] = useState<Mode>("prefetch");
	const selected = modes.find((option) => option.value === mode);
	return (
		<div className="grid gap-3">
			<fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				<legend className="sr-only">Load the post with</legend>
				<div className="inline-flex rounded-md border p-0.5">
					{modes.map((option) => (
						<label
							className={cn(
								"cursor-pointer rounded px-2.5 py-0.5 font-mono text-xs text-muted-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring",
								mode === option.value &&
									"bg-accent font-medium text-foreground",
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
							{option.value}
						</label>
					))}
				</div>
				<p aria-live="polite" className="text-sm text-muted-foreground">
					{selected?.description}
				</p>
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
	hint: "Open a post with each. The requests start at the same moment either way; only what you see while they load differs. Comments are always prefetched.",
	server,
	title: "prefetch vs ensure",
});
