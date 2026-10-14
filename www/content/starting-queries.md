---
title: Starting queries
description: "prefetch, ensure and fetch: what each returns, what it waits for, and how to choose between granular skeletons and a blocked navigation."
section: Guides
order: 5
---

Queries start where the page's inputs are known: a route loader, a server component, or an event handler. All three verbs live on the query client and take a factory plus its input. They differ in what they return and what they wait for:

| Call                          | Returns                       | Cache miss            | Stale data                                    | TanStack Query                                 |
| ----------------------------- | ----------------------------- | --------------------- | --------------------------------------------- | ---------------------------------------------- |
| `qc.prefetch(factory, input)` | `QueryHandle`                 | Starts the request    | Refetches in the background                   | `prefetchQuery`, not awaited                   |
| `qc.ensure(factory, input)`   | `Promise<EnsuredQueryHandle>` | Waits for the request | Resolves at once, refetches in the background | `ensureQueryData({ revalidateIfStale: true })` |
| `qc.fetch(factory, input)`    | `Promise<Data>`               | Waits for the request | Waits for the refetch                         | `fetchQuery`                                   |

Fresh cached data is reused by all three, without a request. So `prefetch` never holds anything up, `ensure` holds up only the first visit (returning to a page shows the cached data at once, then fresh data), and `fetch` always returns fresh data, at the cost of a round trip whenever the cache is stale.

```tsx title="src/routes/posts.$slug.tsx"
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

## prefetch or ensure?

`prefetch` and `ensure` start the request at the same moment, so neither is faster. They differ in what the user sees while it's in flight:

- **`prefetch`: granular skeletons.** The navigation commits right away. Each part of the page that reads a query still loading suspends to its nearest Suspense boundary and fills in when its data streams in.
- **`ensure`: a blocked navigation.** The previous page stays on screen until the data is in. In TanStack Router, a route with a `pendingComponent` shows it once `pendingMs` (1 second by default) has passed, which makes a full-page skeleton.

Choose per query. `ensure` what the page can't lay out without, where a skeleton would only flash or shift (the post itself), and `prefetch` the rest (comments, sidebars, counts). Open a post below with each loader and watch the network panel: the two requests start together either way.

```demo
starting-queries
```

> [!IMPORTANT]
> Start every query before awaiting any of them, as the `prefetch` before the `await` above does, so a blocking query never delays the others.

## Awaiting several queries

Await independent blocking queries together with `allKeyed`, which ships with raf-query. It's a ponyfill of the TC39 `Promise.allKeyed` proposal: a record of promises in, a promise of the same record out, rejecting on the first failure.

```ts
import { allKeyed } from "@raf-query/react";

return await allKeyed({
	post: qc.ensure(postQuery, { slug }),
	author: qc.ensure(authorQuery, { slug }),
});
```

## When to use fetch

`fetch` returns the data itself, not a handle. Use it when the code that starts the query needs the data:

- a server component rendering the data itself (see [React Server Components](./nextjs.md))
- a loader that must branch on the data, such as a redirect
- outside React, in scripts and tests

In a browser loader, prefer `ensure`: a stale `fetch` blocks the navigation on the refetch, while a stale `ensure` renders the cached data at once and updates when the refetch lands.

## Behavior

- Every verb dedupes against the cache: a request already in flight for the entry is joined, not repeated.
- Loaders run on every navigation (TanStack Router reruns them when its own `staleTime` has passed, `0` by default), so returning to a page shows what's cached at once and then fresh data. With `defaultPreload: "intent"`, also set `defaultPreloadStaleTime: 0`: otherwise the router reuses a hover's preload for 30 seconds instead of running the loader on click, and the query cache never hears about the navigation.
- On the server, cached data is always reused, whatever `staleTime` says. Entries marked by `invalidate` still refetch.
- A failed `prefetch` never throws out of the loader. The error surfaces where the data is read, and is reported to the client's `onError`.
- A failed `ensure` or `fetch` rejects, so it reaches the route's error boundary.

## Preloading on intent

Outside loaders, call the client directly. Starting a query when the pointer enters a link means the click finds it cached or in flight:

```tsx
<Link
	to="/posts/$slug"
	params={{ slug }}
	onPointerEnter={() => qc.prefetch(postQuery, { slug })}
>
	{title}
</Link>
```

With TanStack Router's `defaultPreload: "intent"` you get this for free: hovering a link runs its loader, which starts its queries.

Paged factories accept a third argument on `ensure` and `fetch`: `{ pages: n }` loads the first `n` pages up front. See [Infinite queries](./infinite-queries.md).
