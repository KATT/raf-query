---
title: URL state and pagination
description: Put filters, sort and page in the URL, let the loader turn them into the query's input, and pick what shows while the new input loads.
section: Guides
order: 9
---

Filters, sort order and pagination are search params. The loader turns them into the query's input, so every navigation starts the right query and the component only ever reads the handle it was given:

```tsx twoslash title="src/routes/posts.tsx"
import { use, type ReactNode } from "react";
import { type QueryClient, queryOptions, useQuery } from "@raf-query/react";
import type { Post } from "./_twoslash.ts";
function postsQuery(input: { page: number; sort: "newest" | "oldest" }) {
	return queryOptions({
		queryFn: async (): Promise<ReadonlyArray<Post>> => [],
		queryKey: ["posts", input],
	});
}
type Search = { page: number; sort: "newest" | "oldest" };
declare function createFileRoute(path: string): <TLoaderData>(options: {
	readonly component: () => ReactNode;
	readonly loader: (args: {
		readonly context: { readonly queryClient: QueryClient };
		readonly deps: Search;
	}) => TLoaderData;
	readonly loaderDeps: (args: { readonly search: Search }) => Search;
	readonly validateSearch: { parse(input: unknown): Search };
}) => {
	useLoaderData(): TLoaderData;
};
declare function Link(props: {
	readonly children?: ReactNode;
	readonly search: (prev: Search) => Search;
	readonly to: string;
}): ReactNode;
declare function PostList(props: {
	readonly dimmed: boolean;
	readonly posts: ReadonlyArray<Post>;
}): ReactNode;
// ---cut---
import { z } from "zod";

const PostsSearch = z.object({
	sort: z.enum(["newest", "oldest"]).default("newest"),
	page: z.int().positive().default(1),
});

export const Route = createFileRoute("/posts")({
	validateSearch: PostsSearch,
	loaderDeps: (args) => args.search,
	loader: (args) => ({
		posts: args.context.queryClient.prefetch(postsQuery, args.deps),
	}),
	component: PostsPage,
});

function PostsPage() {
	const loaderData = Route.useLoaderData();
	const [postsPromise, postsState] = useQuery(postsQuery, loaderData.posts, {
		whilePending: "previous",
	});

	return (
		<>
			<nav aria-busy={postsState.isPrevious}>
				<Link to="." search={(prev) => ({ ...prev, sort: "newest" })}>
					Newest
				</Link>
				<Link to="." search={(prev) => ({ ...prev, sort: "oldest" })}>
					Oldest
				</Link>
			</nav>
			<PostList posts={use(postsPromise)} dimmed={postsState.isPrevious} />
		</>
	);
}
```

Clicking a link navigates, the loader prefetches `{ sort: "oldest", page: 1 }` without blocking, and the component receives a new handle.

## What shows while the new input loads

That's up to `whilePending`:

| `whilePending`        | While the new input loads                                                                                                                                                                  | Use for                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `"suspend"` (default) | `use()` suspends. TanStack Router and Next.js run navigations as React transitions, so React keeps the whole previous screen, including the old URL's active links, until the data arrives | Short loads, and pages that shouldn't show stale data          |
| `"previous"`          | The navigation commits immediately. The promise keeps the previous input's data and `isPrevious` is true until the new data lands                                                          | Lists, filters, pagination — anything that should feel instant |

Either way, an input that's already cached renders immediately. A component that mounts with a pending handle has no previous data, so `"previous"` suspends like `"suspend"` on first load.

Page through the demo with each mode. Watch the address bar: with `"suspend"` it waits for the data, with `"previous"` it updates at once and the old page dims. Hovering **Next** prefetches the next page, so with a bit of patience neither mode waits.

```demo
pagination
```

This replaces TanStack Query's `placeholderData: keepPreviousData` and `isPlaceholderData`.

## Skeletons for unrelated content

To show a skeleton instead, for instance when moving between unrelated posts, give the Suspense boundary the query's key. React treats it as new content and shows its fallback, even inside a transition:

```tsx twoslash
import { Suspense, type ReactNode } from "react";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { postQuery } from "./_twoslash.ts";
declare const loaderData: { post: QueryHandle<typeof postQuery> };
declare function PostBody(props: {
	readonly post: Promise<unknown>;
}): ReactNode;
declare function PostSkeleton(): ReactNode;
function PostPage() {
	// ---cut---
	// This loader prefetches the post instead of ensuring it.
	const [postPromise, postState] = useQuery(postQuery, loaderData.post);

	return (
		<Suspense key={postState.hash} fallback={<PostSkeleton />}>
			<PostBody post={postPromise} />
		</Suspense>
	);
	// ---cut-after---
}
```

`hash` is the stable string form of the handle's key.

## Pagination versus infinite scroll

They differ in where the page lives:

- **Pagination**: the page is a search param and part of the input, so each page is its own query and the URL links to it.
- **Infinite scroll**: filters and sort are search params, and pages are loaded into one paged query per input. Changing a filter starts a new list from its first page. See [Infinite queries](./infinite-queries.md).

## Why not local state?

It's tempting to keep the page number in `useState` and build the input from it. Don't: the loader can't see component state, so the query would start only after render, the back button wouldn't restore the page, and a shared link would open page one. Keeping the input in the URL makes every view linkable and every query startable before render.

In Next.js the same rules apply: read `searchParams` in the page, `prefetch` with them, and pass the handle to the client component.
