---
title: Starting queries
description: "prefetch, ensure and fetch: what each returns, what it waits for, and how to choose between granular skeletons and a blocked navigation."
section: Guides
order: 5
---

Queries start where the page's inputs are known: a route loader, a server component, or an event handler. All three verbs live on the query client and take a factory plus its input. They differ in what they return and what they wait for:

| Call                          | Returns                        | Cache miss            | Stale data                                    | TanStack Query                                 |
| ----------------------------- | ------------------------------ | --------------------- | --------------------------------------------- | ---------------------------------------------- |
| `qc.prefetch(factory, input)` | `QueryHandle`                  | Starts the request    | Refetches in the background                   | `prefetchQuery`, not awaited                   |
| `qc.ensure(factory, input)`   | `Promise<QueryHandleWithData>` | Waits for the request | Resolves at once, refetches in the background | `ensureQueryData({ revalidateIfStale: true })` |
| `qc.fetch(factory, input)`    | `Promise<QueryHandleWithData>` | Waits for the request | Waits for the refetch                         | `fetchQuery`                                   |

Fresh cached data is reused by all three, without a request. So `prefetch` never holds anything up, `ensure` holds up only the first visit (returning to a page shows the cached data at once, then fresh data), and `fetch` always returns fresh data, at the cost of a round trip whenever the cache is stale.

`ensure` and `fetch` return the same thing: the handle `prefetch` returns, plus the `data` they waited for. See [Handles](./handles.md).

```sample
tanstack-start/src/routes/posts.$slug.tsx#route
```

## prefetch or ensure?

Neither is faster: both start the request at the same moment. The difference is what the user sees while it loads:

- **`prefetch` navigates now.** The new page renders at once, and each part still waiting for data shows its nearest Suspense fallback.
- **`ensure` navigates when the data is in.** Until then the previous page stays on screen. In TanStack Router, a route's `pendingComponent` replaces it after `pendingMs` (1 second by default).

Choose per query: `ensure` what the page can't lay out without (the post itself), and `prefetch` the rest (comments, sidebars, counts).

```demo
starting-queries
```

> [!IMPORTANT]
> Start every query before awaiting any of them, as the `prefetch` before the `await` above does, so a blocking query never delays the others.

## Awaiting several queries

Await independent blocking queries together with `allKeyed`, which ships with raf-query. It's a ponyfill of the TC39 `Promise.allKeyed` proposal: a record of promises in, a promise of the same record out, rejecting on the first failure.

```sample
tanstack-start/src/docs/starting-queries.ts#awaiting-several-queries
```

## When to use fetch

`fetch` is `ensure` that also waits on stale data. Use it when the code that starts the query needs the data to be fresh, not just present:

- a loader that must branch on the data, such as a redirect
- outside React, in scripts and tests

On the server the two wait for the same thing, since cached data is reused there (see [Behavior](#behavior)). In a browser loader, prefer `ensure`: a stale `fetch` blocks the navigation on the refetch, while a stale `ensure` renders the cached data at once and updates when the refetch lands. TanStack Router hides the difference while it still holds the route's last loader data: it renders that and reruns the loader in the background, unless the loader's `staleReloadMode` is `"blocking"`, as in the [demo](#prefetch-or-ensure). There, open a post, go back, and reopen it once its cache is stale.

## Behavior

- Every verb dedupes against the cache: a request already in flight for the entry is joined, not repeated.
- Loaders run on every navigation (TanStack Router reruns them when its own `staleTime` has passed, `0` by default), so returning to a page shows what's cached at once and then fresh data. With `defaultPreload: "intent"`, also set `defaultPreloadStaleTime: 0`: otherwise the router reuses a hover's preload for 30 seconds instead of running the loader on click, and the query cache never hears about the navigation.
- On the server, cached data is always reused, whatever `staleTime` says. Entries marked by `invalidate` still refetch.
- A query with [`ssr: false`](./ssr-and-hydration.md#browser-only-queries) never runs on the server: use `prefetch` there, not `ensure` or `fetch`.
- A failed `prefetch` never throws out of the loader. The error surfaces where the data is read, and is reported to the client's `onError`.
- A failed `ensure` or `fetch` rejects, so it reaches the route's error boundary.

## Preloading on intent

Outside loaders, call the client directly. Starting a query when the pointer enters a link means the click finds it cached or in flight:

```sample
tanstack-start/src/docs/starting-queries.tsx#preloading-on-intent
```

With TanStack Router's `defaultPreload: "intent"` you get this for free: hovering a link runs its loader, which starts its queries.

Paged factories accept a third argument on `ensure` and `fetch`: `{ pages: n }` loads the first `n` pages up front. See [Infinite queries](./infinite-queries.md).
