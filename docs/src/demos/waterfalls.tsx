import { Skeleton } from "@examples/ui/components/skeleton";
import {
	type QueryHandle,
	queryOptions,
	useQuery,
	useQueryClient,
	useWaterfall,
} from "@raf-query/react";
import { Suspense, use, useState } from "react";

import { DemoBrowser, type DemoLoader, DemoLink } from "~/demo-kit/browser.tsx";
import { Segmented } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { seedComments, seedPosts } from "~/demo-kit/fixtures.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

const authors = ["Ada", "Grace", "Linus", "Margaret", "Ken", "Barbara"];

const server = createFakeServer(() => ({
	comments: seedComments(),
	posts: seedPosts().map((post, index) => ({
		...post,
		authorId: index % authors.length,
	})),
}));

function postQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /posts/${input.id}`,
				(db) => db.posts.find((post) => post.id === input.id),
				{ signal: context.signal },
			),
		queryKey: ["posts", input.id],
		staleTime: 30_000,
	});
}

function authorQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: (context) =>
			server.respond(`GET /authors/${input.id}`, () => authors[input.id], {
				signal: context.signal,
			}),
		queryKey: ["authors", input.id],
		staleTime: 30_000,
	});
}

/** The backend resolves the post's author, so the loader needs only the post id. */
function postAuthorQuery(input: { readonly postId: number }) {
	return queryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /posts/${input.postId}/author`,
				(db) =>
					authors[
						db.posts.find((post) => post.id === input.postId)?.authorId ?? 0
					],
				{ signal: context.signal },
			),
		queryKey: ["posts", input.postId, "author"],
		staleTime: 30_000,
	});
}

function commentsQuery(input: { readonly postId: number }) {
	return queryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /posts/${input.postId}/comments`,
				(db) =>
					db.comments.filter((comment) => comment.postId === input.postId),
				{ signal: context.signal },
			),
		queryKey: ["posts", input.postId, "comments"],
		staleTime: 30_000,
	});
}

type Strategy = "loader" | "render";

type PageData =
	| { readonly page: "list" }
	| { readonly id: number; readonly page: "render" }
	| {
			readonly author: QueryHandle<typeof postAuthorQuery>;
			readonly comments: QueryHandle<typeof commentsQuery>;
			readonly page: "loader";
			readonly post: QueryHandle<typeof postQuery>;
	  };

function loaderFor(strategy: Strategy): DemoLoader<PageData> {
	return (args) => {
		const id = Number(args.location.path.split("/")[2]);
		if (!id) {
			return { page: "list" };
		}
		if (strategy === "render") {
			return { id, page: "render" };
		}
		const qc = args.client;
		return {
			author: qc.prefetch(postAuthorQuery, { postId: id }),
			comments: qc.prefetch(commentsQuery, { postId: id }),
			page: "loader",
			post: qc.prefetch(postQuery, { id }),
		};
	};
}

function LineSkeleton(props: { readonly className: string }) {
	return <Skeleton className={props.className} />;
}

function Title(props: { readonly handle: QueryHandle<typeof postQuery> }) {
	const [post] = useQuery(postQuery, props.handle);
	return <h3 className="text-lg font-semibold">{use(post)?.title}</h3>;
}

function Byline(props: { readonly name: string | undefined }) {
	return <p className="text-xs text-muted-foreground">by {props.name}</p>;
}

function CommentList(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}) {
	const [comments] = useQuery(commentsQuery, props.handle);
	return (
		<ul className="grid gap-1.5">
			{use(comments).map((comment) => (
				<li className="rounded-md border px-3 py-1.5 text-sm" key={comment.id}>
					<span className="mr-2 font-medium">{comment.author}</span>
					{comment.body}
				</li>
			))}
		</ul>
	);
}

function LoaderAuthor(props: {
	readonly handle: QueryHandle<typeof postAuthorQuery>;
}) {
	const [author] = useQuery(postAuthorQuery, props.handle);
	return <Byline name={use(author)} />;
}

/** Everything was started by the loader; each part fills in as its data lands. */
function LoaderPost(props: {
	readonly author: QueryHandle<typeof postAuthorQuery>;
	readonly comments: QueryHandle<typeof commentsQuery>;
	readonly post: QueryHandle<typeof postQuery>;
}) {
	return (
		<div className="grid gap-3">
			<div className="grid gap-1">
				<Suspense fallback={<LineSkeleton className="h-6 w-2/3" />}>
					<Title handle={props.post} />
				</Suspense>
				<Suspense fallback={<LineSkeleton className="h-4 w-24" />}>
					<LoaderAuthor handle={props.author} />
				</Suspense>
			</div>
			<Suspense fallback={<LineSkeleton className="h-20 w-full" />}>
				<CommentList handle={props.comments} />
			</Suspense>
		</div>
	);
}

/** Each level discovers what it needs only after its parent's data arrives. */
function RenderPost(props: { readonly id: number }) {
	const handle = useWaterfall(postQuery, { id: props.id });
	const [postPromise] = useQuery(postQuery, handle);
	const post = use(postPromise);
	return (
		<div className="grid gap-3">
			<div className="grid gap-1">
				<h3 className="text-lg font-semibold">{post?.title}</h3>
				<Suspense
					fallback={
						<div className="grid gap-3">
							<LineSkeleton className="h-4 w-24" />
							<LineSkeleton className="h-20 w-full" />
						</div>
					}
				>
					<RenderAuthor authorId={post?.authorId ?? 0} postId={props.id} />
				</Suspense>
			</div>
		</div>
	);
}

function RenderAuthor(props: {
	readonly authorId: number;
	readonly postId: number;
}) {
	const handle = useWaterfall(authorQuery, { id: props.authorId });
	const [author] = useQuery(authorQuery, handle);
	return (
		<>
			<Byline name={use(author)} />
			<Suspense fallback={<LineSkeleton className="mt-3 h-20 w-full" />}>
				<RenderComments postId={props.postId} />
			</Suspense>
		</>
	);
}

function RenderComments(props: { readonly postId: number }) {
	const handle = useWaterfall(commentsQuery, { postId: props.postId });
	return (
		<div className="mt-3">
			<CommentList handle={handle} />
		</div>
	);
}

function Page(props: { readonly data: PageData }) {
	const data = props.data;
	if (data.page === "list") {
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
	return (
		<div className="grid gap-4">
			<DemoLink
				className="text-xs text-muted-foreground hover:text-foreground"
				to={{ path: "/posts" }}
			>
				← All posts
			</DemoLink>
			{data.page === "loader" ? (
				<LoaderPost
					author={data.author}
					comments={data.comments}
					post={data.post}
				/>
			) : (
				<Suspense
					fallback={
						<div className="grid gap-3">
							<LineSkeleton className="h-6 w-2/3" />
							<LineSkeleton className="h-4 w-24" />
							<LineSkeleton className="h-20 w-full" />
						</div>
					}
				>
					<RenderPost id={data.id} />
				</Suspense>
			)}
		</div>
	);
}

function Waterfalls() {
	const qc = useQueryClient();
	const [strategy, setStrategy] = useState<Strategy>("loader");
	return (
		<div className="grid gap-3">
			<Segmented
				label="Start queries in"
				onChange={(next) => {
					qc.clear();
					server.reset();
					setStrategy(next);
				}}
				options={[
					{ label: "the loader", value: "loader" },
					{ label: "render (useWaterfall)", value: "render" },
				]}
				value={strategy}
			/>
			<DemoBrowser
				fallback={<LineSkeleton className="h-24 w-full" />}
				initial={{ path: "/posts" }}
				key={strategy}
				loader={loaderFor(strategy)}
			>
				{(route) => <Page data={route.data} />}
			</DemoBrowser>
		</div>
	);
}

export default defineDemo({
	Component: Waterfalls,
	hint: "Open a post with each strategy and compare the network panel. The loader starts all three requests at once; starting them in render makes each wait for the one before.",
	server,
	title: "One round trip or three",
});
