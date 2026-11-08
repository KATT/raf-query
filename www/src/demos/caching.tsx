import { Skeleton } from "@examples/ui/components/skeleton";
import {
	group,
	load,
	prefetch,
	type QueryHandle,
	infiniteQueryOptions,
	useInfiniteQuery,
} from "@raf-query/react";
import { use } from "react";

import { DemoBrowser, DemoLink } from "~/demo-kit/browser.tsx";
import { formatTime, LoadMoreButton, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { pageOf, seedPosts } from "~/demo-kit/fixtures.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

const posts = group("posts");

const server = createFakeServer(() => ({ posts: seedPosts() }));

function postsQuery() {
	return infiniteQueryOptions({
		gcTime: 10_000,
		queryFn: (context) =>
			server.respond(
				`GET /posts?cursor=${context.pageParam}`,
				(db) => pageOf(db.posts, context.pageParam, 3),
				context,
			),
		// After `queryFn`: TypeScript infers the page type from it.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: posts(),
		staleTime: 5000,
	});
}

type PageData =
	| { readonly page: "about" }
	| { readonly page: "posts"; readonly posts: QueryHandle<typeof postsQuery> };

function PostsSkeleton() {
	return (
		<div className="grid gap-2">
			<Skeleton className="h-5 w-1/3" />
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-8 w-full" />
		</div>
	);
}

function Posts(props: { readonly handle: QueryHandle<typeof postsQuery> }) {
	const [pagesThenable, postsState] = useInfiniteQuery(
		postsQuery,
		props.handle,
	);
	const pages = use(pagesThenable);
	const list = pages.pages.flatMap((page) => page.items);
	return (
		<div aria-busy={postsState.isFetching} className="grid gap-2">
			<p className="flex items-center gap-2 text-xs text-muted-foreground">
				Fetched at {formatTime(postsState.updatedAt)}
				{postsState.isFetching && !postsState.isFetchingNextPage ? (
					<>
						<Spinner /> refetching in the background
					</>
				) : null}
			</p>
			<ul className="grid gap-1.5">
				{list.map((post) => (
					<li className="rounded-md border px-3 py-1.5 text-sm" key={post.id}>
						{post.title}
					</li>
				))}
			</ul>
			<LoadMoreButton
				fetchNextPage={postsState.fetchNextPage}
				hasNextPage={postsState.hasNextPage}
				isFetchingNextPage={postsState.isFetchingNextPage}
			/>
		</div>
	);
}

function Page(props: { readonly data: PageData }) {
	const data = props.data;
	return (
		<div className="grid gap-4">
			<nav className="flex gap-1 text-sm">
				{[
					{ label: "Posts", path: "/posts" },
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
			{data.page === "posts" ? (
				<Posts handle={data.posts} />
			) : (
				<p className="text-sm text-muted-foreground">
					Nothing here reads <code>{'["posts"]'}</code>, so its entry is
					inactive. Come back within 10 seconds to find it cached; wait longer
					and it’s garbage-collected.
				</p>
			)}
		</div>
	);
}

function Caching() {
	return (
		<DemoBrowser
			fallback={<PostsSkeleton />}
			initial={{ path: "/posts" }}
			loader={async (args): Promise<PageData> => {
				if (args.location.path !== "/posts") {
					return { page: "about" };
				}
				const [handles] = await load(args.client, {
					posts: prefetch(postsQuery),
				});
				return { page: "posts", posts: handles.posts };
			}}
		>
			{(route) => <Page data={route.data} />}
		</DemoBrowser>
	);
}

export default defineDemo({
	Component: Caching,
	hint: "staleTime is 5 s and gcTime 10 s. Switch pages and watch the entry in the Queries panel go from fresh to stale, then inactive, and get removed.",
	server,
	title: "The life of a cache entry",
});
