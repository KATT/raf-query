import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	group,
	infiniteQueryOptions,
	invalidateAll,
	invalidateMany,
	invalidateOne,
	load,
	prefetch,
	type QueryClient,
	type QueryHandle,
	useInfiniteQuery,
	useQueryClient,
} from "@raf-query/react";
import { Suspense, use, useTransition } from "react";

import { DemoBrowser } from "~/demo-kit/browser.tsx";
import { formatTime, LoadMoreButton, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { type ListPage, pageOf, seedPosts } from "~/demo-kit/fixtures.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

type Sort = "newest" | "oldest";

const server = createFakeServer(() => ({
	authors: ["Ada", "Grace", "Linus"],
	posts: seedPosts(),
}));

const pageSize = 2;

const posts = group("posts");
const authors = group("authors");

function postsQuery(input: { readonly sort: Sort }) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /posts?sort=${input.sort}&cursor=${context.pageParam}`,
				(db) =>
					pageOf(
						(input.sort === "newest" ? db.posts.toReversed() : db.posts).map(
							(post) => post.title,
						),
						context.pageParam,
						pageSize,
					),
				context,
			),
		// After `queryFn`: TypeScript infers the page type from it.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: posts("list", input),
		staleTime: Infinity,
	});
}

function authorsQuery() {
	return infiniteQueryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /authors?cursor=${context.pageParam}`,
				(db) => pageOf(db.authors, context.pageParam, pageSize),
				context,
			),
		// After `queryFn`: TypeScript infers the page type from it.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: authors("list"),
		staleTime: Infinity,
	});
}

interface PageData {
	readonly authors: QueryHandle<typeof authorsQuery>;
	readonly newest: QueryHandle<typeof postsQuery>;
	readonly oldest: QueryHandle<typeof postsQuery>;
}

interface StringPages {
	readonly pages: ReadonlyArray<ListPage<string>>;
}

function ListCard(props: { readonly pagesThenable: Promise<StringPages> }) {
	const data = use(props.pagesThenable);
	return (
		<ul className="grid gap-1 text-sm">
			{data.pages
				.flatMap((page) => page.items)
				.map((item) => (
					<li className="truncate" key={item}>
						{item}
					</li>
				))}
		</ul>
	);
}

function Card(props: {
	readonly fetching: boolean;
	readonly fetchNextPage: () => Promise<void>;
	readonly hasNextPage: boolean;
	readonly isFetchingNextPage: boolean;
	readonly label: string;
	readonly pagesThenable: Promise<StringPages>;
	readonly updatedAt: number;
}) {
	return (
		<section
			aria-busy={props.fetching}
			className={cn(
				"grid content-start gap-2 rounded-lg border p-3 transition-colors",
				props.fetching && "border-sky-500/60 bg-sky-500/5",
			)}
		>
			<h4 className="flex items-center justify-between gap-2 font-mono text-xs">
				{props.label}
				{props.fetching ? <Spinner /> : null}
			</h4>
			<Suspense
				fallback={
					<div className="grid gap-1">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-2/3" />
					</div>
				}
			>
				<ListCard pagesThenable={props.pagesThenable} />
			</Suspense>
			<LoadMoreButton
				fetchNextPage={props.fetchNextPage}
				hasNextPage={props.hasNextPage}
				isFetchingNextPage={props.isFetchingNextPage}
			/>
			<p className="text-[11px] text-muted-foreground tabular-nums">
				{props.updatedAt ? `Fetched ${formatTime(props.updatedAt)}` : "Loading"}
			</p>
		</section>
	);
}

function PostsCard(props: {
	readonly handle: QueryHandle<typeof postsQuery>;
	readonly label: string;
}) {
	const [pagesThenable, state] = useInfiniteQuery(postsQuery, props.handle);
	return (
		<Card
			fetching={state.isFetching}
			fetchNextPage={state.fetchNextPage}
			hasNextPage={state.hasNextPage}
			isFetchingNextPage={state.isFetchingNextPage}
			label={props.label}
			pagesThenable={pagesThenable}
			updatedAt={state.updatedAt}
		/>
	);
}

function AuthorsCard(props: {
	readonly handle: QueryHandle<typeof authorsQuery>;
}) {
	const [pagesThenable, state] = useInfiniteQuery(authorsQuery, props.handle);
	return (
		<Card
			fetching={state.isFetching}
			fetchNextPage={state.fetchNextPage}
			hasNextPage={state.hasNextPage}
			isFetchingNextPage={state.isFetchingNextPage}
			label='[authors, "list"]'
			pagesThenable={pagesThenable}
			updatedAt={state.updatedAt}
		/>
	);
}

const actions: ReadonlyArray<{
	readonly code: string;
	readonly run: (queryClient: QueryClient) => Promise<void>;
}> = [
	{
		code: "invalidateMany(qc, posts)",
		run: (qc) => invalidateMany(qc, posts),
	},
	{
		code: 'invalidateMany(qc, postsQuery, { sort: "oldest" })',
		run: (qc) => invalidateMany(qc, postsQuery, { sort: "oldest" }),
	},
	{
		code: 'invalidateOne(qc, postsQuery, { sort: "newest" })',
		run: (qc) => invalidateOne(qc, postsQuery, { sort: "newest" }),
	},
	{ code: "invalidateAll(qc)", run: (qc) => invalidateAll(qc) },
];

function InvalidateButtons() {
	const qc = useQueryClient();
	const [isPending, startTransition] = useTransition();
	return (
		<div className="grid gap-1.5">
			{actions.map((action) => (
				<Button
					className="h-auto justify-start py-1 font-mono text-xs whitespace-normal"
					disabled={isPending}
					key={action.code}
					onClick={() => {
						startTransition(async () => {
							await action.run(qc);
						});
					}}
					size="sm"
					variant="outline"
				>
					{action.code}
				</Button>
			))}
		</div>
	);
}

function Page(props: { readonly data: PageData }) {
	return (
		<div className="grid gap-3">
			<div className="grid gap-2 sm:grid-cols-3">
				<PostsCard
					handle={props.data.newest}
					label='[posts, "list", { sort: "newest" }]'
				/>
				<PostsCard
					handle={props.data.oldest}
					label='[posts, "list", { sort: "oldest" }]'
				/>
				<AuthorsCard handle={props.data.authors} />
			</div>
			<InvalidateButtons />
		</div>
	);
}

function Invalidation() {
	return (
		<DemoBrowser
			fallback={<Skeleton className="h-40 w-full" />}
			initial={{ path: "/dashboard" }}
			loader={async (args): Promise<PageData> => {
				const [handles] = await load(args.client, {
					authors: prefetch(authorsQuery),
					newest: prefetch(postsQuery, { sort: "newest" }),
					oldest: prefetch(postsQuery, { sort: "oldest" }),
				});
				return handles;
			}}
		>
			{(route) => <Page data={route.data} />}
		</DemoBrowser>
	);
}

export default defineDemo({
	Component: Invalidation,
	hint: "Every query here has staleTime: Infinity, so nothing refetches until it's invalidated. Invalidate the posts group, a factory's queries with part of an input, one query, or everything, and see which lists refetch.",
	server,
	title: "Invalidating by group, factory and query",
});
