# @raf-query/react

Render-as-you-fetch data fetching for React 19.

Route loaders and server components start queries. They pass small, serializable **handles** to components, which read the data with `useQuery` and React's `use()` under Suspense. The cache (dedupe, staleness, retries, paging, SSR streaming) follows [TanStack Query](https://tanstack.com/query).

This package has the hooks, the provider, and the framework integrations. It re-exports everything from [`@raf-query/core`](https://www.npmjs.com/package/@raf-query/core), so it's the only raf-query package an app needs.

## Install

```shell
npm install @raf-query/react
```

Needs `react` 19.2 or later. The integrations need `@tanstack/react-router` 1.170+ or `next` 16+, depending on which one you use.

## Quick start

This walks through TanStack Start. [Next.js](#nextjs-app-router) is below.

### 1. Define a query

A query is a factory: a function of zero or one argument that returns `queryOptions(...)`. The loader and the component call the same factory, so types flow end to end.

```ts
// src/queries.ts
import { queryOptions } from "@raf-query/react";

import { getPost } from "./server-functions.ts";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost({ data: input }),
		staleTime: 30_000,
	});
}
```

### 2. Create the client and provider

```tsx
// src/router.tsx
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen.ts";

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

`getRouter` runs once per request on the server, so each request gets its own client. `setupRouterIntegration` streams the server's cache to the browser.

### 3. Start the query in a loader

```tsx
// src/routes/posts.$slug.tsx
import { createFileRoute } from "@tanstack/react-router";

import { postQuery } from "../queries.ts";

export const Route = createFileRoute("/posts/$slug")({
	loader: (args) => ({
		post: args.context.queryClient.prefetch(postQuery, {
			slug: args.params.slug,
		}),
	}),
	component: PostPage,
});
```

`prefetch` starts the request and returns a handle right away. Use `await qc.ensure(...)` instead when the route must not render without the data.

### 4. Read it

```tsx
import { useQuery } from "@raf-query/react";
import { use } from "react";

function PostPage() {
	const loaderData = Route.useLoaderData();
	const [postPromise, postState] = useQuery(postQuery, loaderData.post);
	const post = use(postPromise);

	return (
		<article aria-busy={postState.isFetching}>
			<h1>{post.title}</h1>
			<p>{post.body}</p>
		</article>
	);
}
```

`useQuery` returns a stable promise and the query's controls. `use()` suspends until the data arrives, or returns at once when the cache already has it. Wrap the reading component in `<Suspense>` for a fallback.

## Next.js App Router

```tsx
// app/get-query-client.ts
import { QueryClient } from "@raf-query/react";
import { cache } from "react";

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
// app/posts/[slug]/page.tsx (server component)
import { HydrationBoundary } from "@raf-query/react/rsc";
import { Suspense } from "react";

import { getQueryClient } from "../../get-query-client.ts";

export default async function Page(props: {
	params: Promise<{ slug: string }>;
}) {
	const params = await props.params;
	const qc = getQueryClient();
	const post = qc.prefetch(postQuery, { slug: params.slug });

	return (
		<HydrationBoundary client={qc}>
			<Suspense fallback={<PostSkeleton />}>
				<PostBody handle={post} />
			</Suspense>
		</HydrationBoundary>
	);
}
```

`PostBody` is a client component that calls `useQuery(postQuery, props.handle)`. Render a `HydrationBoundary` in each server component that starts queries for client components. Server components that render the data themselves can `await qc.fetch(postQuery, { slug })`.

## Entry points

| Import                                 | For                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `@raf-query/react`                     | Hooks, provider, and all of `@raf-query/core`                                                                                   |
| `@raf-query/react/tanstack-router`     | `setupRouterIntegration`: streams the cache during SSR, clears it per request, and handles `redirect()` thrown from a `queryFn` |
| `@raf-query/react/rsc`                 | `HydrationBoundary`: a server component that sends the request client's queries to the browser cache                            |
| `@raf-query/react/next`                | `QueryProvider`: the client provider for Next.js App Router. It also streams queries that client components start during SSR    |
| `@raf-query/react/devtools`            | `QueryDevtools` and `QueryDevtoolsPanel`, a cache inspector that renders nothing in production builds                           |
| `@raf-query/react/devtools/production` | The same devtools, kept in production builds                                                                                    |

## API

### Client

| Call                                  | Does                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `new QueryClient(config?)`            | The cache. `config`: `defaults` (query options), `onError`, `isServer` |
| `qc.prefetch(factory, input)`         | Start a query; returns a handle without waiting                        |
| `await qc.ensure(factory, input)`     | Start a query and wait for data; returns a handle                      |
| `await qc.fetch(factory, input)`      | Start a query and wait; returns the data                               |
| `await qc.invalidate(factory, input)` | Mark stale and refetch what's on screen; also takes `{ queryKey }`     |
| `qc.setData(factory, input, updater)` | Write data directly                                                    |
| `qc.getData(factory, input)`          | Read cached data, or `undefined`                                       |

Factories return `queryOptions(...)` or, for paged lists, `infiniteQueryOptions(...)`. Every verb takes either kind. The client has more (`reset`, `remove`, `subscribe`, Effect versions under `qc.effect`), covered in the [`@raf-query/core` README](https://github.com/katt/raf-query/tree/main/packages/core#readme).

### Hooks and components

| Export                                | Use                                                    |
| ------------------------------------- | ------------------------------------------------------ |
| `QueryClientProvider`                 | Provides a client to the tree                          |
| `useQueryClient()`                    | The provided client                                    |
| `useQuery(factory, handle, options?)` | `[promise, controls]` for the query a handle points at |
| `useWaterfall(factory, input)`        | Start a query during render and return its handle      |

`useQuery` options: `whilePending` (`"suspend"`, the default, or `"previous"` to keep showing the last input's data while a new one loads), `refetchInterval`, `refetchOnWindowFocus`, `refetchOnReconnect`.

Controls: `isPending`, `isPrevious`, `isFetching`, `isStale`, `error`, `updatedAt`, `key`, `input`, `hash` (for `key` props on Suspense boundaries), and `refetch()`. Paged queries add `fetchNextPage()`, `fetchPreviousPage()`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage`, and `isFetchingPreviousPage`.

`useWaterfall` is for inputs only known at render time, like an id from a parent query's data. Each one is an extra round trip, so prefer starting the query in a loader.

### Writes

There is no `useMutation`. Write in a form action or transition, then invalidate:

```tsx
import { useQueryClient } from "@raf-query/react";

function EditTitle(props: { slug: string }) {
	const qc = useQueryClient();

	return (
		<form
			action={async (formData) => {
				const title = String(formData.get("title"));
				await updatePost({ slug: props.slug, title });
				await qc.invalidate(postQuery, { slug: props.slug });
			}}
		>
			<input name="title" />
		</form>
	);
}
```

`await qc.invalidate(...)` resolves once the queries on screen have refetched, so the action stays pending until fresh data shows. Use React's `useOptimistic` for optimistic UI.

## Learn more

The [raf-query README](https://github.com/katt/raf-query#readme) is the full guide: blocking vs. streaming loaders, search params and `whilePending`, paged queries, mutations, SSR details, Effect, and devtools. [`examples/`](https://github.com/katt/raf-query/tree/main/examples) has the same issue tracker built on TanStack Start and on Next.js.

## License

MIT
