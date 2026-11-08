---
title: Starting queries
description: "load with prefetch, swr and revalidate: what each waits for, what it returns, and how to choose between granular skeletons and a blocked navigation."
section: Guides
order: 5
---

Queries start where the page's inputs are known: a route loader, a server component, or an event handler. `load` takes the client and a record of **entries**, one per query. Each entry names a factory and its input, and its kind decides what the load waits for:

| Entry                        | Cache miss            | Stale data                                    | TanStack Query                                                                                                                                         |
| ---------------------------- | --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prefetch(factory, input)`   | Starts the request    | Refetches in the background                   | [`prefetchQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient#prefetchquery), not awaited                     |
| `swr(factory, input)`        | Waits for the request | Resolves at once, refetches in the background | [`ensureQueryData({ revalidateIfStale: true })`](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient#ensurequerydata) |
| `revalidate(factory, input)` | Waits for the request | Waits for the refetch                         | [`fetchQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient#fetchquery)                                        |

Fresh cached data is reused by all three, without a request. The names come from HTTP's [`Cache-Control`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) directives, with `staleTime` as the max-age: `swr` is [`stale-while-revalidate`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#stale-while-revalidate), which serves stale data while it refetches, and `revalidate` is [`must-revalidate`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#must-revalidate), which refetches stale data before using it.

So `prefetch` never holds anything up, `swr` holds up only the first visit (returning to a page shows the cached data at once, then fresh data), and `revalidate` always returns fresh data, at the cost of a round trip whenever the cache is stale. That difference needs a client that keeps its cache between navigations, as a TanStack Router loader's or a client-only React Router `clientLoader`'s does. Code that only runs on the server has none: see [Server-only code](#server-only-code).

`load` resolves to `[handles, data]`: a `QueryHandle` for every entry, and the data of the `swr` and `revalidate` ones. A component reads every handle the same way, and `use()` returns a waited-for query's data without suspending. See [Handles](./handles.md).

```sample
tanstack-start/src/routes/posts.$slug.tsx#route
```

## prefetch or swr?

Neither is faster: both start the request at the same moment. The difference is what the user sees while it loads:

- **`prefetch` navigates now.** The new page renders at once, and each part still waiting for data shows its nearest [Suspense](https://react.dev/reference/react/Suspense) fallback.
- **`swr` navigates when the data is in.** Until then the previous page stays on screen. In TanStack Router, a route's [`pendingComponent`](https://tanstack.com/router/latest/docs/guide/data-loading#showing-a-pending-component) replaces it after `pendingMs` (1 second by default).

Choose per query: `swr` for what the page can't lay out without (the post itself), and `prefetch` for the rest (comments, sidebars, counts).

```demo
starting-queries
```

> [!IMPORTANT]
> Put every query a loader needs in one `load`. It starts every entry before it waits for any, so a blocking query never delays the others, whatever their order. Two `await load(…)` in a row are a waterfall.

## Awaiting several queries

Several waiting entries in one `load` wait together, and `data` has each one's data, typed by its factory. The load rejects as soon as one of them fails:

```sample
tanstack-start/src/docs/starting-queries.ts#awaiting-several-queries
```

## Conditional queries

Some queries only start for some requests, such as drafts that only an admin sees. Put `skipToken` in place of the entry when the query shouldn't start:

```sample
tanstack-start/src/docs/starting-queries.conditional-queries.tsx#loader
```

A `skipToken` starts nothing. Its handle is `undefined`, so the handle's type is `QueryHandle<typeof draftsQuery> | undefined`, and `data` has no key for it. `useQuery` takes only a handle, so render the component that reads the query only when there is one:

```sample
tanstack-start/src/docs/starting-queries.conditional-queries.tsx#component
```

The condition is decided where the loader runs, from what it knows: the route's params and search, its context, or another entry's data that it waited for. Data only the browser has, such as a permission, has no loader entry: see [Browser-only queries](./ssr-and-hydration.md#browser-only-queries).

## When to use revalidate

`revalidate` is `swr` that also waits on stale data. Use it when the code that starts the query needs the data to be fresh, not just present:

- a loader that must branch on the data, such as a redirect
- outside React, in scripts and tests

In a browser loader, prefer `swr`: a stale `revalidate` blocks the navigation on the refetch, while a stale `swr` renders the cached data at once and updates when the refetch lands. TanStack Router hides the difference while it still holds the route's last loader data: it renders that and reruns the loader in the background, unless the loader's [`staleReloadMode`](https://tanstack.com/router/latest/docs/guide/data-loading#choosing-background-vs-blocking-stale-reloads) is `"blocking"`, as in the [demo](#prefetch-or-swr). There, open a post, go back, and reopen it once its cache is stale.

## Server-only code

React server components and React Router's [`loader`](https://reactrouter.com/start/framework/data-loading#server-data-loading) run only on the server, for every navigation, and each request gets a new client. Its cache starts empty, so every query is a cache miss, so `swr` and `revalidate` wait for the same request every time, and returning to a page waits again.

Use `prefetch` and `revalidate` in that code, not `swr`: `prefetch` for what can stream in behind a Suspense fallback, `revalidate` for what the page can't lay out without or the code needs to branch on. See [React Server Components](./react-server-components.md#pages) and [React Router](./react-router.md#server-loaders).

A client-only React Router app is different: its [`clientLoader`](https://reactrouter.com/start/framework/data-loading#client-data-loading)s run in the browser on the tab's client, which keeps its cache between navigations, so there `swr` holds up only the first visit, as in TanStack Router. See [React Router](./react-router.md#client-loaders).

## Behavior

- Every entry dedupes against the cache: a request already in flight for the entry is joined, not repeated.
- Loaders run on every navigation (TanStack Router reruns them when [its own `staleTime`](https://tanstack.com/router/latest/docs/guide/data-loading#using-staletime-to-control-how-long-data-is-considered-fresh) has passed, `0` by default), so returning to a page shows what's cached at once and then fresh data. With [`defaultPreload: "intent"`](https://tanstack.com/router/latest/docs/guide/preloading), also set [`defaultPreloadStaleTime: 0`](https://tanstack.com/router/latest/docs/guide/preloading#built-in-preloading-freshness-and-retention): otherwise the router reuses a hover's preload for 30 seconds instead of running the loader on click, and the query cache never hears about the navigation.
- On the server, `staleTime` doesn't apply: the client belongs to one request, so what it fetched is fresh for that request. `prefetch` and `swr` reuse cached data even after an [invalidation](./query-invalidation.md#invalidation-on-the-server). `revalidate` reuses it until an invalidation, then waits for the refetch.
- A `skipToken` in place of an entry starts nothing and gets an `undefined` handle. See [Conditional queries](#conditional-queries).
- A failed `prefetch` never makes the load reject. The error surfaces where the data is read.
- A failed `swr` or `revalidate` makes the load reject, so it reaches the route's error boundary.

## Preloading on intent

Outside loaders, call `load` yourself. Starting a query when the pointer enters a link means the click finds it cached or in flight:

```sample
tanstack-start/src/docs/starting-queries.tsx#preloading-on-intent
```

With TanStack Router's `defaultPreload: "intent"` you get this for free: hovering a link runs its loader, which starts its queries.

Paged factories take a third argument on `swr` and `revalidate`: `{ pages: n }` loads the first `n` pages up front. See [Infinite queries](./infinite-queries.md).
