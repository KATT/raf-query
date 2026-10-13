# raf-query

Render-as-you-fetch data fetching for React.

Queries start in route loaders and React Server Components, travel to components as small serializable **handles**, and are read with React's `use()` under Suspense. Fetch-on-render is an explicitly named escape hatch, not the default.

The cache's mechanics (dedupe, staleness, retries, infinite paging, SSR hydration) follow [TanStack Query](https://tanstack.com/query); the public API is built around loaders, RSC, and `use()` instead of `useQuery`-in-render.

The cache is written in [Effect](https://effect.website), but using raf-query doesn't take any Effect: `queryFn`s return promises, and `QueryClient`, the hooks and the integrations speak promises. Apps that do use Effect get the same cache as Effects, with typed errors and services ([Effect](#effect)).

## Status

Early. Both packages are on npm at `0.x`, and the API can still change between patch releases.

## Examples

The same issue tracker, built on two frameworks so the integrations can be compared side by side. Each opens in StackBlitz, which runs it in the browser:

| Example                                                     | Framework          | Try it                                                                                                                                                                                             |
| ----------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`examples/tanstack-start`](examples/tanstack-start#readme) | TanStack Start     | [Open in StackBlitz](https://stackblitz.com/github/KATT/raf-query/tree/stackblitz/examples/tanstack-start?file=apps/tanstack-start/src/queries.ts,apps/tanstack-start/src/routes/issues.index.tsx) |
| [`examples/nextjs`](examples/nextjs#readme)                 | Next.js App Router | [Open in StackBlitz](https://stackblitz.com/github/KATT/raf-query/tree/stackblitz/examples/nextjs?file=apps/nextjs/src/queries.ts,apps/nextjs/src/app/issues/page.tsx)                             |

## Packages

| Package            | Contents                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `@raf-query/core`  | Framework-agnostic and Effect-only: `QueryCache`, `queryOptions` / `infiniteQueryOptions`, handles, dehydrate / hydrate                     |
| `@raf-query/react` | `QueryClient` (the cache with Promise methods), hooks, provider, `allKeyed`. Re-exports `@raf-query/core`, so apps import only this package |

`effect` (`^4.0.0`) is a peer dependency of both, so an app that uses Effect shares one copy with raf-query. npm, pnpm and Bun install it automatically; with Yarn, add it yourself (`yarn add effect`).

`@raf-query/react` subpath entries for framework integrations and tooling:

| Entry                              | Use                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `@raf-query/react/tanstack-router` | Streams the router's query cache to the client during SSR              |
| `@raf-query/react/rsc`             | `HydrationBoundary` for passing server-component queries to the client |
| `@raf-query/react/next`            | `QueryProvider` for Next.js App Router                                 |
| `@raf-query/react/devtools`        | [Devtools](#devtools) panel for inspecting the cache in development    |

## Principles

- **Fetch where React recommends.** Loaders and server components start queries. Components read them.
- **Promises in, `use()` out.** The read hook returns a stable promise; components unwrap it with `use()`, so reads can be conditional or happen in a child.
- **The URL is the input.** Anything that changes what a query fetches (filters, sort, page) lives in path or search params, so the loader starts the right query on every navigation. Components never derive query input from local state.
- **Actions for writes.** Mutations are plain async functions in form actions or transitions. The cache provides invalidation, React provides pending and optimistic state.

## Defining queries

A query is a **factory**: a function of zero or one argument that returns `queryOptions(...)` or `infiniteQueryOptions(...)`. The loader and the component call the same factory, so data types flow end to end.

```ts
import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

// TanStack Start server functions (`createServerFn`); in Next.js, server actions.
import { getPost, listComments } from "./posts.functions.ts";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost({ data: input }),
		staleTime: 30_000,
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: ["comments", input.slug],
		queryFn: (context) =>
			listComments({ data: { slug: input.slug, cursor: context.pageParam } }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
```

Factories must take at most one argument; the type rejects two or more. The single argument is the query's **input** and must be serializable, because it is what a handle carries.

A `queryFn` returns a value, a promise, or an [Effect](#effect). It receives `queryKey`, the query's [`meta`](#query-meta) and an abort `signal`; paged ones also get `pageParam` and `direction`. TypeScript infers the page type from `queryFn`, so if `getNextPageParam` comes first in the object literal (sorted keys), pass the types instead: `infiniteQueryOptions<CommentPage, number>({ ... })`.

The factory is the only place a query is declared paged. Every other API — `prefetch`, `ensure`, `fetch`, `useQuery`, `useWaterfall`, `invalidate`, `setData` — takes either kind and infers the rest from the factory's type.

### Query meta

`meta` attaches anything you want to know about a query elsewhere. It reaches the `queryFn` context, `Query.metaUnsafe(query)` (from the latest factory call) and the devtools. A common use is a per-query message for one global error handler:

```ts
import { Query, QueryClient, queryOptions } from "@raf-query/react";

export function issuesQuery() {
	return queryOptions({
		queryKey: ["issues"],
		queryFn: () => listIssues(),
		meta: { errorMessage: "Couldn't load issues" },
	});
}

const queryClient = new QueryClient({
	onError: (error, query) => {
		toast.error(
			Query.metaUnsafe(query)?.errorMessage ?? "Something went wrong",
		);
	},
});
```

`meta` is `Record<string, unknown>` by default. Type it for the whole app by augmenting `Register` in the package you import from (`@raf-query/react` re-exports it from `@raf-query/core`, so either works):

```ts
declare module "@raf-query/react" {
	interface Register {
		queryMeta: { errorMessage?: string };
	}
}
```

`config.defaults` takes `meta` too, for queries that set none; a query's own `meta` replaces the default as a whole. `meta` is sent with dehydrated state, so keep it serializable: a hydrated entry reports the sender's `meta` until the receiving side calls its factory.

## Starting queries

All three verbs live on the query client and accept a factory plus its input.

| Call                              | Returns                       | Blocks? | Use for                                                                |
| --------------------------------- | ----------------------------- | ------- | ---------------------------------------------------------------------- |
| `qc.prefetch(factory, input)`     | `QueryHandle`                 | No      | Data the route can render without; it streams in                       |
| `await qc.ensure(factory, input)` | `Promise<EnsuredQueryHandle>` | Yes     | Data the route must not render without; `useQuery` returns it directly |
| `await qc.fetch(factory, input)`  | `Promise<Data>`               | Yes     | Rendering in a server component, or building another input             |

```tsx
// TanStack Start
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const comments = qc.prefetch(commentsQuery, { slug: args.params.slug });
		const post = await qc.ensure(postQuery, { slug: args.params.slug });
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
- `ensure` and `fetch` wait only on a cache miss. With stale cached data they resolve immediately, so the navigation isn't held up, and revalidate in the background: the page renders the cached data and re-renders when the refetch lands.
- Loaders run on every navigation (TanStack Router reruns them when its own `staleTime` has passed, `0` by default), so returning to a page shows what's cached at once and then fresh data. With `defaultPreload: "intent"`, also set `defaultPreloadStaleTime: 0`: otherwise the router reuses a hover's preload for 30 seconds instead of running the loader on click, and the query cache never hears about the navigation.
- On the server, cached data is always reused, whatever `staleTime` says. A server client renders once, so a background refetch could only repeat a request whose result is never shown. Entries marked by `invalidate` still refetch.
- A failed `prefetch` never throws out of the loader. The error surfaces where the data is read, and is reported to the client's `onError`.
- A failed `ensure` or `fetch` rejects, so it reaches the route's error boundary.

## Handles

A handle is the only thing that crosses the loader → component or server → client boundary:

```ts
interface QueryHandle<TFactory> {
	readonly key: QueryKey; // ["post", "hello"]
	readonly input: InputOf<TFactory>; // { slug: "hello" }
}

// From `ensure`: the route waited for the data.
interface EnsuredQueryHandle<TFactory> {
	readonly key: QueryKey;
	readonly input: InputOf<TFactory>;
	readonly ensured: true;
}
```

Handles hold no data and no functions. Data reaches the client cache through the [hydration stream](#ssr-and-hydration), so loader data stays tiny and each query is serialized once. The loader's return value lists exactly which queries a route started, and its types show which ones the route waited for: `useQuery` returns the data for an `EnsuredQueryHandle` and a promise for a `QueryHandle`. The two aren't assignable to each other, so type a prop with the one its loader returns.

## Reading queries

### `useQuery`

```ts
const [promise, controls] = useQuery(factory, handle, options?);
const [data, controls] = useQuery(factory, ensuredHandle, options?);
```

`options` takes [`whilePending`](#when-the-url-changes) and per-read refetch settings (`refetchInterval`, `refetchOnWindowFocus`, `refetchOnReconnect`). There is no option to change the input; the handle decides what is read.

`promise` is a stable `Promise<Data>` owned by the cache. Unwrap it with `use()`. When the cache already has data, the promise is pre-resolved and `use()` returns synchronously without suspending.

A handle from `ensure` had its data loaded before the route rendered, so `useQuery` returns the data itself. If the entry has lost that data since (it was garbage-collected while the router kept the loader data, or `reset`), the hook suspends until it is refetched.

```tsx
function PostPage() {
	const loaderData = Route.useLoaderData();
	// `post` came from `qc.ensure`, `comments` from `qc.prefetch`.
	const [post, postState] = useQuery(postQuery, loaderData.post);

	return (
		<article>
			<h1>{post.title}</h1>
			<button
				disabled={postState.isFetching}
				onClick={() => startTransition(() => postState.refetch())}
			>
				Refresh
			</button>
			<p>{post.body}</p>
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

When the cache updates — refetch, invalidation, `setData` — the hook returns a new, pre-resolved promise and the component re-renders without suspending. New data is structurally shared with the old: objects and arrays that are deeply equal keep their identity, and a refetch that returns equal data keeps the same promise, so nothing re-renders. Controls are tracked: reading `controls.isFetching` subscribes the component to `isFetching`, and a change to a control it never read doesn't re-render it. When the **first** load fails, the promise rejects and `use()` throws to the nearest error boundary. Resetting that boundary refetches the query.

`useQuery` never refetches on mount: whatever started the query decides. Stale data refetches in the background when a loader or server component starts the query again (`prefetch`, `ensure`, `fetch`, or hydrating the server's copy), when `useWaterfall` mounts, when invalidated, on window focus or reconnect, on `refetch()`, or on `refetchInterval`.

For an app-wide indicator, `useIsFetching()` returns how many queries have a request in flight, background refetches included, and re-renders when that changes. Pass a filter to count only some: `useIsFetching({ queryKey: ["comments"] })`. It's `0` on the server and during hydration, so the indicator never appears in server HTML. Outside React, `qc.isFetching(filter?)` returns the same number.

```tsx
// Rendered once, in the root layout.
function GlobalProgress() {
	const fetching = useIsFetching();
	return fetching > 0 ? <ProgressBar /> : null;
}
```

### Paged queries

With an `infiniteQueryOptions` factory, `useQuery` returns the same tuple. The promise resolves to `{ pages, pageParams }`, and the controls add paging:

```tsx
function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [pagesPromise, comments] = useQuery(commentsQuery, props.handle);
	const data = use(pagesPromise);

	return (
		<>
			{data.pages
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

### Infinite scroll

Infinite scroll is the same paged query with an automatic "Load more". A ref callback watches the button and presses it when it nears the viewport. Unmount the button while a page loads: it watches again when it remounts, so it keeps loading while it stays in reach. Its place is taken by skeletons the size of the incoming page, so the loaded rows replace them without moving anything below.

```tsx
function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [pagesPromise, comments] = useQuery(commentsQuery, props.handle);
	const data = use(pagesPromise);

	return (
		<>
			{data.pages
				.flatMap((page) => page.items)
				.map((comment) => (
					<Comment key={comment.id} {...comment} />
				))}
			{comments.isFetchingNextPage ? <CommentSkeletons /> : null}
			{comments.hasNextPage && !comments.isFetchingNextPage ? (
				<button
					onClick={() => comments.fetchNextPage()}
					ref={(button) => {
						if (button === null) return;
						const observer = new IntersectionObserver(
							(entries) => {
								if (entries.some((entry) => entry.isIntersecting)) {
									observer.disconnect();
									comments.fetchNextPage();
								}
							},
							{ rootMargin: "0px 0px 300px 0px" },
						);
						observer.observe(button);
						return () => observer.disconnect();
					}}
				>
					Load more
				</button>
			) : null}
		</>
	);
}
```

Pagination and infinite scroll differ in where the page lives:

- **Pagination**: the page is a search param and part of the input, so each page is its own query and the URL links to it ([below](#when-the-url-changes)).
- **Infinite scroll**: filters and sort are search params, and pages are loaded into one paged query per input. Changing a filter starts a new list from its first page.

The [examples](examples/) load their issue list and comments by infinite scroll.

### When the URL changes

Filters, sort order, and pagination are search params. The loader turns them into the query's input, so every navigation starts the right query and the component only ever reads the handle it was given:

```tsx
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

Clicking a link navigates, the loader prefetches `{ sort: "oldest", page: 1 }` without blocking, and the component receives a new handle. What it renders while that input loads is set by `whilePending`:

| `whilePending`        | While the new input loads                                                                                                                                                                  | Use for                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `"suspend"` (default) | `use()` suspends. TanStack Router and Next.js run navigations as React transitions, so React keeps the whole previous screen, including the old URL's active links, until the data arrives | Short loads, and pages that shouldn't show stale data          |
| `"previous"`          | The navigation commits immediately. The promise keeps the previous input's data and `isPrevious` is true until the new data lands                                                          | Lists, filters, pagination — anything that should feel instant |

Either way, an input that's already cached renders immediately. A component that mounts with a pending handle has no previous data, so `"previous"` suspends like `"suspend"` on first load.

To show a skeleton instead, for instance when moving between unrelated posts, give the Suspense boundary the query's key. React treats it as new content and shows its fallback, even inside a transition:

```tsx
// This loader prefetches the post instead of ensuring it.
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

A component can call the hook with a prefetched handle and hand the promise to a child, so only the child suspends:

```tsx
const [postPromise] = useQuery(postQuery, loaderData.post); // from `qc.prefetch`
return (
	<Suspense fallback={<Spinner />}>
		<PostBody post={postPromise} />
	</Suspense>
);
```

A component re-renders when the promise changes, and when a control it reads changes. Controls it never reads, like `isFetching` here, don't re-render it, so a parent that only passes the promise down stays put during background refetches.

## Render-time inputs: `useWaterfall`

When an input is only known at render time (an id from a parent query's result), no loader can start the query. `useWaterfall` starts it during render and returns a handle, so the consumer looks the same as one fed by a loader:

```tsx
function PostAuthor(props: { post: Post }) {
	const author = useWaterfall(authorQuery, { id: props.post.authorId });
	const [authorPromise] = useQuery(authorQuery, author);
	return <AuthorCard author={use(authorPromise)} />;
}
```

Like `prefetch` in a loader, `useWaterfall` refetches stale cached data in the background, once each time the component mounts or its input changes. Re-renders don't refetch.

The name is the warning: each waterfall is an extra round trip after render. First try to get the input from route params so the loader can start it, or have the backend return it with its parent.

During SSR the `queryFn` runs on the server. TanStack Start server functions work there. Next.js rejects server actions called while rendering, so in Next.js start the dependent query in the server component instead:

```tsx
const post = await qc.fetch(postQuery, { slug });
const author = qc.prefetch(authorQuery, { id: post.authorId });
```

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

`updatePost` is a server function (or a Next.js server action). `await qc.invalidate(...)` resolves once every query currently being read has refetched, so the action's pending state lasts until the fresh data is on screen. For an error message, wrap the action in `useActionState` and return the caught error.

| Call                                  | Effect                                                  |
| ------------------------------------- | ------------------------------------------------------- |
| `qc.invalidate(factory, input)`       | Mark one query stale and refetch it if it is being read |
| `qc.invalidate(filter)`               | Same, for every query the [filter](#filters) selects    |
| `qc.setData(factory, input, updater)` | Write data directly                                     |
| `qc.getData(factory, input)`          | Read cached data, or `undefined`                        |

### Filters

`invalidate`, `reset` and `remove` also take a filter, `{ queryKey?, exact?, predicate? }`. `queryKey` selects every query whose key starts with it, or only that key with `exact: true`; object segments match partially, so `{ queryKey: ["issues", { projectId: 3 }] }` selects every issue list in project 3. `predicate` gets each remaining `Query` and keeps the ones it returns `true` for: read its `key` and `handle.input`, or use the `Query` functions (`Query.getUnsafe(query)` for its state, `Query.observerCountUnsafe(query)`, `Query.isStaleUnsafe(query)`). Without `queryKey` every key matches, so `{}` selects the whole cache.

```ts
qc.remove({ predicate: (query) => Query.observerCountUnsafe(query) === 0 }); // everything not being read
```

`handle.input` is the input of the latest factory call for that entry. An entry that was only hydrated, and not yet read or started on this client, has `undefined` input, so match on `key` to include those.

Data can be `undefined` when the `queryFn`'s type allows it (`Promise<User | undefined>`); it's cached and reused like any other value, unlike in TanStack Query, where an `undefined` result is an error. So `getData` and an updater's `previous` return `undefined` both with no data and with `undefined` data; `Query.getUnsafe(qc.getQuery(factory, input)).hasData` tells them apart.

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

`setupRouterIntegration` streams queries during SSR, clears the request's cache when the response finishes, and turns `redirect()` thrown from a `queryFn` into a router navigation. `getRouter` runs per request on the server, so each request gets its own client. Options: `dehydrateOptions` (`filter`, `keepErrors`, `serializeData`), `hydrateOptions` (`deserializeData`), and `handleRedirects: false` to handle redirects yourself. By default a server error crosses to the browser as a `RedactedError` naming the query, so its message doesn't leak into the page.

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
	const params = await props.params;
	const qc = getQueryClient();

	const comments = qc.prefetch(commentsQuery, { slug: params.slug });
	const post = await qc.fetch(postQuery, { slug: params.slug });

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
- `HydrationBoundary` sends the request client's entries to the browser cache; pending ones stream as promises. Render one in each server component that starts queries for client components. Entries already sent in this request are skipped. The browser takes the server's data when it's newer than its own. Otherwise it keeps its copy and refetches it if stale. That covers a payload the router replays from its cache (back and forward) and a `prefetch` still pending on the server.
- `QueryProvider` creates the browser client, and streams queries that client components start during SSR (`useWaterfall`) into the HTML. Pass `config` for the client's options; it must be serializable.
- Server components that only render data can `await qc.fetch(...)` anywhere; the per-request client makes one request per query, whatever its `staleTime`.
- `fetch` returns data, not a handle. When a server component renders the data and also hands the query to a client component, pass `await qc.ensure(...)`: after the `fetch` it resolves from the cache, and the client component gets the data from `useQuery` without a promise.
- Factories can call server actions: server components call them directly, and the browser calls them on refetch. Validate their arguments, since anyone can call them.

#### Server-only queries

A factory that imports server-only code (a database client) can't be imported by a client component, so it can't be read with `useQuery`. Render its data in a server component, or pass a plain promise prop and `use()` it on the client. Refresh it with `router.refresh()`.

## Effect

raf-query's cache is written in [Effect](https://effect.website): `QueryClient` is a Promise wrapper around a `QueryCache` service from `@raf-query/core`, available as `qc.effect`. Effect code uses the cache directly, or builds its own with `QueryCache.make(config)` (scoped: closing the scope interrupts every request and timer) or `QueryCache.layer(config)`:

- A `queryFn` can return an `Effect`. Cancelling the request interrupts it.
- An Effect `queryFn`'s error type is the query's: `qc.effect.fetch(issueQuery, input)` fails with `IssueNotFound | Query.CancelledError`. `ErrorOf<TFactory>` names it; it's `unknown` for promises. A `queryFn` that throws instead of returning is a defect, and isn't retried.
- `retry` accepts a `Schedule` as well as a count or predicate.
- `qc.effect` has every verb as an Effect: `prefetch`, `ensure`, `fetch`, `invalidate`, `reset`, `remove`, `setData`, `getData` (an `Option`), `isFetching` (a count), `dehydrate`, `hydrate`. `watch` is a `Stream` of an entry's state, and `events` a `Stream` of cache events.
- SSR streaming is Effect too, and the integrations are thin wrappers over it. `dehydrateStream(options)` (scoped) returns the cache's `initial` state and a `Stream` of `updates`: entries that start or settle later, each sent once, batched per microtask. The stream ends when the scope closes. `hydrateStream(stream)` hydrates each state as it arrives. `Stream.toReadableStream` / `Stream.fromReadableStream` carry it over a web stream. The `sent` option (a `Set` of hashes) makes separate `dehydrate` calls of one request skip entries already sent.
- Entries are a data type with module functions, as in Effect's own modules: `Query.fetch(query)`, `Query.refetch(query)`, `Query.invalidate(query)`, `Query.changes(query)`, and `Query.getUnsafe(query)` / `Query.subscribeUnsafe(query, listener)` for synchronous reads.
- `QueryObserver` is a data type too: one reader's view of a query, as `useQuery` sees it (the controls and the promise, with `whilePending`, `refetchInterval` and the focus / reconnect options). `QueryObserver.make(query, options)` creates one, and `QueryObserver.changes(observer)` streams its results; while it runs, the query counts as read and polls on `refetchInterval`.
- Time comes from the `Clock` and the page from the `Platform` service (focus, visibility, `navigator.onLine`; the default reads the globals). Provide `TestClock` or another `Platform` to test staleness, gc and offline retries without a browser.

```ts
import { QueryCache, queryOptions } from "@raf-query/core";
import { Effect, Schedule, Stream } from "effect";

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueRepo.get(input.id), // Effect<Issue, IssueNotFound>
		retry: Schedule.exponential("200 millis").pipe(Schedule.upTo({ times: 3 })),
	});
}

const program = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	const issue = yield* cache.fetch(issueQuery, { id: 1 });
	yield* cache.watch(issueQuery, { id: 1 }).pipe(
		Stream.map((state) => state.data?.title),
		Stream.runForEach((title) => Effect.log(title)),
	);
});

Effect.runFork(program.pipe(Effect.provide(QueryCache.layer())));
```

`watch` counts as a reader while it runs, so invalidation and window focus refetch the entry. Outside React, `cache.mount` (`Effect<void, never, Scope>`) refetches read, stale entries on window focus and reconnect while its scope is open.

### Services

A `queryFn`'s Effect can require services. They're part of the factory's type, `ServicesOf<TFactory>`, and every verb that can start the query requires them:

```ts
import { QueryCache, queryOptions } from "@raf-query/core";
import { Context, Effect, Layer } from "effect";

class IssueApi extends Context.Service<
	IssueApi,
	{ readonly get: (id: number) => Effect.Effect<Issue, IssueNotFound> }
>()("app/IssueApi") {}

const IssueApiLive = Layer.succeed(IssueApi, { get: IssueRepo.get });

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () =>
			Effect.gen(function* () {
				const api = yield* IssueApi;
				return yield* api.get(input.id);
			}),
	});
}

// Effect<Issue, IssueNotFound | Query.CancelledError, QueryCache | IssueApi>
const issue = QueryCache.QueryCache.use((cache) =>
	cache.fetch(issueQuery, { id: 1 }),
);

Effect.runFork(
	issue.pipe(Effect.provide(QueryCache.layer()), Effect.provide(IssueApiLive)),
);
```

- On `QueryCache`, `ensure`, `fetch`, `prefetch`, `getQuery` and `watch` require the factory's services, and so does `Query.fetch`. A request runs with the services the cache was built with, under those of the latest of these calls for its entry. Requests that start without a caller (a render's read, `refetch`, polling, focus and reconnect, `invalidate`) reuse the entry's last services.
- The caller's `Scope` isn't passed on: a request outlives the call that started it. Scope a `queryFn`'s resources with `Effect.scoped`.
- Each request runs in a `raf-query.request` span with a `raf_query.hash` attribute, under the latest caller's span if it had one. Defects are logged with `Effect.logError`; typed failures are the query's error.

`QueryClient` gets its services from a `layer`. It's built into the client's scope with the cache, so it must build synchronously. The client's type is `QueryClient<TServices>`, and its verbs accept only factories whose services the layer provides; any other factory is a type error. `dispose()` interrupts every request and runs the layer's finalizers:

```ts
const queryClient = new QueryClient({ layer: IssueApiLive }); // QueryClient<IssueApi>
const handle = queryClient.prefetch(issueQuery, { id: 1 });

await queryClient.dispose();
```

`QueryClientProvider` takes a client of any services. A hook can't know which ones, so `useQueryClient()` returns a `QueryClient<unknown>`, whose verbs accept any factory, and `useQuery` reads any factory: a request then fails with a defect if the client's layer lacks a service it needs.

## Devtools

`@raf-query/react/devtools` shows the browser's query cache as it changes. Render `QueryDevtools` anywhere under the provider:

```tsx
import { QueryDevtools } from "@raf-query/react/devtools";

<QueryClientProvider client={queryClient}>
	{props.children}
	<QueryDevtools />
</QueryClientProvider>;
```

In Next.js, put it inside `QueryProvider` in the root layout. It's a client component, so a server-component layout can render it.

A button in the corner opens a panel docked to the edge of the viewport. The panel lists every entry with its observer count (mounted readers) and status:

| Status     | Meaning                                    |
| ---------- | ------------------------------------------ |
| `fetching` | A request is in flight                     |
| `error`    | The last request failed                    |
| `stale`    | Read, and older than `staleTime`           |
| `fresh`    | Read, and within `staleTime`               |
| `inactive` | Nothing reads it; it's removed at `gcTime` |

Select an entry to see its key, input, meta, data, error, and last update, and to **Refetch**, **Invalidate**, **Reset** (drop its data, so readers suspend and refetch) or **Remove** it. The header filters entries by key, sorts them, and has **Invalidate all** and **Clear cache**. The panel keeps its open state and size in `localStorage`.

`QueryDevtools` props, all optional:

| Prop             | Values (default first)                                         |
| ---------------- | -------------------------------------------------------------- |
| `client`         | The nearest `QueryClientProvider`'s client, or another one     |
| `initialIsOpen`  | `false`, `true`. Applies until the user opens or closes it     |
| `buttonPosition` | `"bottom-right"`, `"bottom-left"`, `"top-right"`, `"top-left"` |
| `position`       | `"bottom"`, `"top"`, `"left"`, `"right"`: the docked edge      |
| `theme`          | `"system"`, `"dark"`, `"light"`                                |

`QueryDevtoolsPanel` is the panel alone, to place in your own layout. It takes `client`, `theme`, `style`, and `onClose`, which adds a close button.

Both render nothing on the server, since the server's cache isn't the browser's. They also render nothing when `process.env.NODE_ENV` is `"production"`, and bundlers drop the panel's code from production builds. To ship the panel in production, for example lazily behind a flag, import from `@raf-query/react/devtools/production`.

## API reference

`QueryClient`:

| Member                                      | Use                                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `new QueryClient(config?)`                  | `config.defaults` (query options below), `config.onError`, `config.isServer`, `config.layer` ([services](#services))    |
| `prefetch`, `ensure`, `fetch`               | [Start queries](#starting-queries)                                                                                      |
| `invalidate`, `setData`, `getData`          | [Write and read the cache](#mutations)                                                                                  |
| `reset(factory, input)` / `reset(filter)`   | Drop data and errors; read queries suspend and refetch. Resolves when they settle. [Filters](#filters)                  |
| `remove(factory, input)` / `remove(filter)` | Remove entries and abort their requests. [Filters](#filters)                                                            |
| `effect`                                    | The [Effect](#effect) `QueryCache` behind the client                                                                    |
| `subscribe(listener)`                       | Cache events: `added`, `updated`, `observers` (a reader subscribed or left), `removed`, and `failed` (with the `error`) |
| `isFetching(filter?)`                       | How many entries have a request in flight, optionally only those matching `{ queryKey, exact? }`                        |
| `getAll()`, `getQuery(factory, input?)`     | Cache entries, for devtools and integrations                                                                            |
| `clear()`                                   | Drop every entry and abort in-flight requests                                                                           |
| `mount()`                                   | Start window-focus and reconnect refetching. The providers call it                                                      |
| `isServer`                                  | Detected from `window`. Server clients don't retry, never gc, skip stale timers, and never revalidate cached data       |
| `dispose()`                                 | Interrupt every request and release the layer's services. Resolves when its finalizers have run                         |

Query options, accepted by `queryOptions`, `infiniteQueryOptions` and `config.defaults`:

| Option                                                | Default                                   |
| ----------------------------------------------------- | ----------------------------------------- |
| `staleTime`                                           | `0` ms                                    |
| `gcTime`                                              | 5 minutes; `Infinity` on the server       |
| `retry` (count, `boolean`, predicate, `Schedule`)     | `3`; `0` on the server                    |
| `retryDelay` (ms, or a function of the failure count) | Doubling from 1 s, at most 30 s           |
| `refetchOnWindowFocus`, `refetchOnReconnect`          | `true` (only read, stale queries refetch) |
| `structuralSharing` (keep deeply equal parts of data) | `true`                                    |
| [`meta`](#query-meta)                                 | None                                      |

`infiniteQueryOptions` also takes `getPreviousPageParam` and `maxPages`.

In the browser, retries pause while `navigator.onLine` is `false`: after the retry delay, the next attempt waits for the window's `online` event. The request stays fetching meanwhile, and cancelling it (`remove`, `clear`, a restart) stops the wait. The first attempt runs regardless.

When the last reader of a query unsubscribes during a background refetch, a `queryFn` that read its `signal` (or returned an Effect) is aborted: the entry keeps its data and goes back to how it was before the request, and `fetch` callers waiting on it get the cached data. Other requests, including every first load (a render may be suspended on it), finish so their result is cached, but don't retry unless a reader comes back. Requests nothing has subscribed to yet, like a loader's `prefetch`, keep running.

`@raf-query/core`:

| Export                                                       | Use                                                                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QueryCache`                                                 | The cache service (`qc.effect`): `make`, `layer`, and the verbs as Effects                                                                                                                 |
| `Query`                                                      | Cache entries: `Query.fetch`, `Query.changes`, `Query.getUnsafe`, `Query.metaUnsafe`, …                                                                                                    |
| `Platform`                                                   | The page the cache watches (focus, network); swap it in tests                                                                                                                              |
| `queryOptions(options)`                                      | Typed options for a query factory                                                                                                                                                          |
| `infiniteQueryOptions(options)`                              | Typed options for a paged query factory                                                                                                                                                    |
| `hashKey(key)`, `matchesKey(key, prefix)`                    | Key helpers                                                                                                                                                                                |
| `QueryObserver`                                              | One reader's view of a query, with tracked results; for bindings                                                                                                                           |
| `Query.CancelledError`                                       | Failure of an Effect request whose entry was removed or cleared before it settled. `qc.fetch` / `qc.ensure` reject with an `AbortError` `DOMException` instead, as an aborted `fetch` does |
| `RedactedError`                                              | What a streamed pending query rejects with when its server request failed                                                                                                                  |
| `QueryHandle<TFactory>`                                      | Handle type for props                                                                                                                                                                      |
| `EnsuredQueryHandle<TFactory>`                               | Handle type for props fed by `ensure`                                                                                                                                                      |
| `Thenable<T>`                                                | Promise with `status` / `value` / `reason`, read by `use()`                                                                                                                                |
| `DataOf<TFactory>`, `InputOf<TFactory>`, `ErrorOf<TFactory>` | A factory's data, input and error types                                                                                                                                                    |
| `ServicesOf<TFactory>`                                       | The services a factory's `queryFn` Effect needs; `never` for promises                                                                                                                      |
| `Register`, `QueryMeta`                                      | Augment `Register` with `queryMeta` to type [`meta`](#query-meta)                                                                                                                          |

`@raf-query/react` (plus all of the above):

| Export                                         | Use                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `QueryClient`                                  | The cache with Promise methods ([above](#api-reference))                                                        |
| `allKeyed(record)`                             | Await a record of promises, keeping keys                                                                        |
| `dehydrate(client)` / `hydrate(client, state)` | Low-level cache transfer used by the integrations                                                               |
| `QueryClientProvider`                          | Provides a client to the tree                                                                                   |
| `useQueryClient()`                             | Read the client                                                                                                 |
| `useQuery(factory, handle, options?)`          | `[Thenable<Data>, controls]`; for paged factories `Data` is `{ pages, pageParams }` and controls include paging |
| `useWaterfall(factory, input)`                 | Start a query during render and return its handle                                                               |
| `useIsFetching(filter?)`                       | How many queries have a request in flight, re-rendering when it changes; for global loading indicators          |

## Development

See [`.github/DEVELOPMENT.md`](.github/DEVELOPMENT.md).
