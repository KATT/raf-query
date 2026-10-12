# raf-query

Render-as-you-fetch data fetching for React.

Queries start in route loaders and React Server Components, travel to components as small serializable **handles**, and are read with React's `use()` under Suspense. Fetch-on-render is an explicitly named escape hatch, not the default.

The cache's mechanics (dedupe, staleness, retries, infinite paging, SSR hydration) follow [TanStack Query](https://tanstack.com/query); the public API is built around loaders, RSC, and `use()` instead of `useQuery`-in-render.

## Status

Design spec. This README describes the API being built; nothing is published yet.

## Packages

| Package            | Contents                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `@raf-query/core`  | Framework-agnostic: `QueryClient`, cache, `queryOptions` / `infiniteQueryOptions`, handles, dehydrate / hydrate stream, `allKeyed` |
| `@raf-query/react` | Hooks and provider. Re-exports everything from `@raf-query/core`, so apps install and import only this package                     |

`@raf-query/react` subpath entries for framework integrations:

| Entry                              | Use                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `@raf-query/react/tanstack-router` | Streams the router's query cache to the client during SSR              |
| `@raf-query/react/rsc`             | `HydrationBoundary` for passing server-component queries to the client |
| `@raf-query/react/next`            | `QueryProvider` for Next.js App Router                                 |

## Principles

- **Fetch where React recommends.** Loaders and server components start queries. Components read them.
- **Promises in, `use()` out.** The read hook returns a stable promise; components unwrap it with `use()`, so reads can be conditional or happen in a child.
- **The URL is the input.** Anything that changes what a query fetches (filters, sort, page) lives in path or search params, so the loader starts the right query on every navigation. Components never derive query input from local state.
- **Actions for writes.** Mutations are plain async functions in form actions or transitions. The cache provides invalidation, React provides pending and optimistic state.

## Defining queries

A query is a **factory**: a function of zero or one argument that returns `queryOptions(...)` or `infiniteQueryOptions(...)`. The loader and the component call the same factory, so data types flow end to end.

```ts
import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: async ({ signal }) => {
			const res = await fetch(`/api/posts/${input.slug}`, { signal });
			return (await res.json()) as Post;
		},
		staleTime: 30_000,
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: ["comments", input.slug],
		queryFn: ({ pageParam, signal }) =>
			api.comments.list({ slug: input.slug, cursor: pageParam }, { signal }),
		initialPageParam: null as string | null,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
```

Factories must take at most one argument; the type rejects two or more. The single argument is the query's **input** and must be serializable, because it is what a handle carries.

The factory is the only place a query is declared paged. Every other API — `prefetch`, `ensure`, `fetch`, `useQuery`, `useWaterfall`, `invalidate`, `setData` — takes either kind and infers the rest from the factory's type.

## Starting queries

All three verbs live on the query client and accept a factory plus its input.

| Call                              | Returns                | Blocks? | Use for                                                    |
| --------------------------------- | ---------------------- | ------- | ---------------------------------------------------------- |
| `qc.prefetch(factory, input)`     | `QueryHandle`          | No      | Data the route can render without; it streams in           |
| `await qc.ensure(factory, input)` | `Promise<QueryHandle>` | Yes     | Data the route must not render without                     |
| `await qc.fetch(factory, input)`  | `Promise<Data>`        | Yes     | Rendering in a server component, or building another input |

```tsx
// TanStack Start
export const Route = createFileRoute("/posts/$slug")({
	loader: async ({ context: { queryClient: qc }, params }) => {
		const comments = qc.prefetch(commentsQuery, { slug: params.slug });
		const post = await qc.ensure(postQuery, { slug: params.slug });
		return { post, comments };
	},
	component: PostPage,
});
```

Await independent blocking queries together with `allKeyed`, which ships with raf-query. It's a ponyfill of the TC39 `Promise.allKeyed` proposal: a record of promises in, a promise of the same record out, rejecting on the first failure.

```ts
import { allKeyed } from "@raf-query/react";

return await allKeyed({
	post: qc.ensure(postQuery, { slug }),
	author: qc.ensure(authorQuery, { slug }),
});
```

Dependent inputs use `fetch`:

```ts
const user = await qc.fetch(currentUserQuery);
return { org: qc.prefetch(orgQuery, { orgId: user.orgId }) };
```

Behavior:

- Every verb dedupes against the cache. A fresh entry is reused; a stale entry is refetched in the background.
- `ensure` and `fetch` wait only on a cache miss. With stale cached data they resolve immediately and revalidate in the background.
- A failed `prefetch` never throws out of the loader. The error surfaces where the data is read, and is reported to the client's `onError`.
- A failed `ensure` or `fetch` rejects, so it reaches the route's error boundary.

## Handles

A handle is the only thing that crosses the loader → component or server → client boundary:

```ts
interface QueryHandle<TFactory> {
	readonly key: QueryKey; // ["post", "hello"]
	readonly input: InputOf<TFactory>; // { slug: "hello" }
}
```

Handles hold no data and no functions. Data reaches the client cache through the [hydration stream](#ssr-and-hydration), so loader data stays tiny and each query is serialized once. The loader's return value lists exactly which queries a route started, and a handle from `ensure` versus `prefetch` shows whether the route waited for it.

## Reading queries

### `useQuery`

```ts
const [promise, controls] = useQuery(factory, handle, options?);
```

`options` takes [`whilePending`](#when-the-url-changes) and per-read refetch settings (`refetchInterval`, `refetchOnWindowFocus`). There is no option to change the input; the handle decides what is read.

`promise` is a stable `Promise<Data>` owned by the cache. Unwrap it with `use()`. When the cache already has data, the promise is pre-resolved and `use()` returns synchronously without suspending.

```tsx
function PostPage() {
	const loaderData = Route.useLoaderData();
	const [postPromise, post] = useQuery(postQuery, loaderData.post);
	const { title, body } = use(postPromise);

	return (
		<article>
			<h1>{title}</h1>
			<button
				disabled={post.isFetching}
				onClick={() => startTransition(() => post.refetch())}
			>
				Refresh
			</button>
			<p>{body}</p>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={loaderData.comments} />
			</Suspense>
		</article>
	);
}
```

`controls`:

| Field          | Meaning                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `isPending`    | No data yet for the handle's input; `use(promise)` will suspend                                                          |
| `isPrevious`   | The promise holds data for a previous input while the handle's input loads (see [`whilePending`](#when-the-url-changes)) |
| `isFetching`   | A request is in flight: first load, new input, or background refetch                                                     |
| `isStale`      | Data is older than `staleTime`                                                                                           |
| `error`        | Error from a failed background refetch. Existing data stays readable                                                     |
| `updatedAt`    | When the data in the promise was fetched                                                                                 |
| `key`, `input` | Key and input of the data in the promise. They differ from the handle's while `isPrevious` is true                       |
| `hash`         | Stable string form of the handle's key, for `key` props on Suspense boundaries                                           |
| `refetch()`    | Refetch now. Returns a promise, so it can be awaited inside a transition or action                                       |

When the cache updates — refetch, invalidation, `setData` — the hook returns a new, pre-resolved promise and the component re-renders without suspending. When the **first** load fails, the promise rejects and `use()` throws to the nearest error boundary. Resetting that boundary refetches the query.

Queries do not refetch on mount. They refetch when a loader starts them again, when invalidated, on window focus or reconnect while stale, on `refetch()`, or on `refetchInterval`.

### Paged queries

With an `infiniteQueryOptions` factory, `useQuery` returns the same tuple. The promise resolves to `{ pages, pageParams }`, and the controls add paging:

```tsx
function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [pagesPromise, comments] = useQuery(commentsQuery, props.handle);
	const { pages } = use(pagesPromise);

	return (
		<>
			{pages
				.flatMap((page) => page.items)
				.map((comment) => (
					<Comment key={comment.id} {...comment} />
				))}
			<button
				disabled={!comments.hasNextPage || comments.isFetchingNextPage}
				onClick={() => comments.fetchNextPage()}
			>
				Load more
			</button>
		</>
	);
}
```

Paging controls: `fetchNextPage()`, `fetchPreviousPage()`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage`, `isFetchingPreviousPage`. They exist only on the type for paged factories.

On the server, `ensure` and `fetch` load the first page. Pass `{ pages: n }` as a third argument to load more up front; the option is only accepted for paged factories.

### When the URL changes

Filters, sort order, and pagination are search params. The loader turns them into the query's input, so every navigation starts the right query and the component only ever reads the handle it was given:

```tsx
type PostsSearch = { sort: "newest" | "oldest"; page: number };

export const Route = createFileRoute("/posts")({
	validateSearch: (search): PostsSearch => ({
		sort: search.sort === "oldest" ? "oldest" : "newest",
		page: Number(search.page ?? 1),
	}),
	loaderDeps: ({ search }) => search,
	loader: ({ context: { queryClient: qc }, deps }) => ({
		posts: qc.prefetch(postsQuery, deps),
	}),
	component: PostsPage,
});

function PostsPage() {
	const { posts } = Route.useLoaderData();
	const [postsPromise, postsState] = useQuery(postsQuery, posts, {
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

Clicking a link navigates, the loader prefetches `{ sort: "oldest", page: 1 }` without blocking, and the component receives a new handle. What it renders while that input loads is set by `whilePending`:

| `whilePending`        | While the new input loads                                                                                                                                                                  | Use for                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `"suspend"` (default) | `use()` suspends. TanStack Router and Next.js run navigations as React transitions, so React keeps the whole previous screen, including the old URL's active links, until the data arrives | Short loads, and pages that shouldn't show stale data          |
| `"previous"`          | The navigation commits immediately. The promise keeps the previous input's data and `isPrevious` is true until the new data lands                                                          | Lists, filters, pagination — anything that should feel instant |

Either way, an input that's already cached renders immediately. A component that mounts with a pending handle has no previous data, so `"previous"` suspends like `"suspend"` on first load.

To show a skeleton instead, for instance when moving between unrelated posts, give the Suspense boundary the query's key. React treats it as new content and shows its fallback, even inside a transition:

```tsx
const [postPromise, postState] = useQuery(postQuery, loaderData.post);

return (
	<Suspense key={postState.hash} fallback={<PostSkeleton />}>
		<PostBody post={postPromise} />
	</Suspense>
);
```

`hash` is the stable string form of the handle's key.

In Next.js the same rules apply: read `searchParams` in the page, `prefetch` with them, and pass the handle to the client component.

### Passing promises down

A component can call the hook and hand the promise to a child, so only the child suspends:

```tsx
const [postPromise] = useQuery(postQuery, loaderData.post);
return (
	<Suspense fallback={<Spinner />}>
		<PostBody post={postPromise} />
	</Suspense>
);
```

The parent re-renders when `controls` change. If it only passes the promise down, call the hook in the child instead.

## Render-time inputs: `useWaterfall`

When an input is only known at render time (an id from a parent query's result), no loader can start the query. `useWaterfall` starts it during render and returns a handle, so the consumer looks the same as one fed by a loader:

```tsx
function PostAuthor(props: { post: Post }) {
	const author = useWaterfall(authorQuery, { id: props.post.authorId });
	const [authorPromise] = useQuery(authorQuery, author);
	return <AuthorCard author={use(authorPromise)} />;
}
```

The name is the warning: each waterfall is an extra round trip after render. First try to get the input from route params so the loader can start it, or have the backend return it with its parent.

For event-driven preloading, call the client directly: `onPointerEnter={() => qc.prefetch(postQuery, { slug })}`.

## Mutations

There is no `useMutation`. Write data in a form action or transition, then invalidate:

```tsx
function EditTitle(props: { post: Post }) {
	const qc = useQueryClient();
	const [title, setOptimisticTitle] = useOptimistic(props.post.title);

	return (
		<form
			action={async (formData) => {
				const next = String(formData.get("title"));
				setOptimisticTitle(next);
				await updatePost({ slug: props.post.slug, title: next });
				await qc.invalidate(postQuery, { slug: props.post.slug });
			}}
		>
			<input name="title" defaultValue={title} />
		</form>
	);
}
```

`await qc.invalidate(...)` resolves once every query currently being read has refetched, so the action's pending state lasts until the fresh data is on screen.

| Call                                  | Effect                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `qc.invalidate(factory, input)`       | Mark one query stale and refetch it if it is being read                 |
| `qc.invalidate({ queryKey, exact? })` | Same, for every query whose key starts with `queryKey` (unless `exact`) |
| `qc.setData(factory, input, updater)` | Write data directly                                                     |
| `qc.getData(factory, input)`          | Read cached data, or `undefined`                                        |

## SSR and hydration

The server's query client streams its cache to the browser's query client as entries settle. Pending queries cross as promises, so the browser resumes the server's request instead of starting a new one. Components never hydrate anything themselves; a handle only needs its key to find the entry.

### TanStack Start

```tsx
// src/router.tsx
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";

export function getRouter() {
	const queryClient = new QueryClient();
	const router = createRouter({
		routeTree,
		context: { queryClient },
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({ router, queryClient });
	return router;
}
```

`setupRouterIntegration` streams queries during SSR, clears the request's cache when the response finishes, and turns `redirect()` thrown from a `queryFn` into a router navigation. `getRouter` runs per request on the server, so each request gets its own client.

### Next.js App Router

```tsx
// app/get-query-client.ts
import { cache } from "react";
import { QueryClient } from "@raf-query/react";

export const getQueryClient = cache(() => new QueryClient());
```

```tsx
// app/layout.tsx
import { QueryProvider } from "@raf-query/react/next";

export default function RootLayout(props: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<QueryProvider>{props.children}</QueryProvider>
			</body>
		</html>
	);
}
```

```tsx
// app/posts/[slug]/page.tsx — server component
import { HydrationBoundary } from "@raf-query/react/rsc";

export default async function Page(props: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await props.params;
	const qc = getQueryClient();

	const comments = qc.prefetch(commentsQuery, { slug });
	const post = await qc.fetch(postQuery, { slug });

	return (
		<HydrationBoundary client={qc}>
			<article>
				<h1>{post.title}</h1>
				<Suspense fallback={<CommentsSkeleton />}>
					<Comments handle={comments} />
				</Suspense>
			</article>
		</HydrationBoundary>
	);
}
```

- `getQueryClient` is scoped to one request by React's `cache()`.
- `HydrationBoundary` sends the request client's entries to the browser cache; pending ones stream as promises. Render one in each server component that starts queries for client components. Entries already sent in this request are skipped.
- `QueryProvider` creates the browser client, and streams queries that client components start during SSR (`useWaterfall`) into the HTML.
- Server components that only render data can `await qc.fetch(...)` anywhere; the per-request client dedupes them.

#### Server-only queries

A factory that imports server-only code (a database client) can't be imported by a client component, so it can't be read with `useQuery`. Render its data in a server component, or pass a plain promise prop and `use()` it on the client. Refresh it with `router.refresh()`.

## API reference

`@raf-query/core`:

| Export                                         | Use                                               |
| ---------------------------------------------- | ------------------------------------------------- |
| `QueryClient`                                  | The cache. Methods listed above                   |
| `queryOptions(options)`                        | Typed options for a query factory                 |
| `infiniteQueryOptions(options)`                | Typed options for a paged query factory           |
| `allKeyed(record)`                             | Await a record of promises, keeping keys          |
| `dehydrate(client)` / `hydrate(client, state)` | Low-level cache transfer used by the integrations |
| `QueryHandle<TFactory>`                        | Handle type for props                             |

`@raf-query/react` (plus all of the above):

| Export                                | Use                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `QueryClientProvider`                 | Provides a client to the tree                                                                                  |
| `useQueryClient()`                    | Read the client                                                                                                |
| `useQuery(factory, handle, options?)` | `[Promise<Data>, controls]`; for paged factories `Data` is `{ pages, pageParams }` and controls include paging |
| `useWaterfall(factory, input)`        | Start a query during render and return its handle                                                              |

## Development

See [`.github/DEVELOPMENT.md`](.github/DEVELOPMENT.md).
