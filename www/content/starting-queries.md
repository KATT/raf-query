---
title: Starting queries
description: "load with prefetchEntry, ensureEntry and fetchEntry: what each waits for, what it returns, and how to choose between granular skeletons and a blocked navigation."
section: Guides
order: 5
---

Queries start where the page's inputs are known: a route loader, a server component, or an event handler. `load` takes the client and a record of **entries**, one per query. Each entry names a factory and its input, and its kind decides what the load waits for:

| Entry                           | Handle               | Cache miss            | Stale data                                    | TanStack Query                                                                                                                                         |
| ------------------------------- | -------------------- | --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prefetchEntry(factory, input)` | `QueryHandle`        | Starts the request    | Refetches in the background                   | [`prefetchQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient#prefetchquery), not awaited                     |
| `ensureEntry(factory, input)`   | `DefinedQueryHandle` | Waits for the request | Resolves at once, refetches in the background | [`ensureQueryData({ revalidateIfStale: true })`](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient#ensurequerydata) |
| `fetchEntry(factory, input)`    | `DefinedQueryHandle` | Waits for the request | Waits for the refetch                         | [`fetchQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient#fetchquery)                                        |

Fresh cached data is reused by all three, without a request. So `prefetchEntry` never holds anything up, `ensureEntry` holds up only the first visit (returning to a page shows the cached data at once, then fresh data), and `fetchEntry` always returns fresh data, at the cost of a round trip whenever the cache is stale. That difference needs a client that keeps its cache between navigations, as a TanStack Router loader's or a client-only React Router `clientLoader`'s does. Code that only runs on the server has none: see [Server-only code](#server-only-code).

`load` resolves to `[handles, data]`: a handle for every entry, and the data of the `ensureEntry` and `fetchEntry` ones. A handle from a waiting entry is a `DefinedQueryHandle`, which `useQuery` reads as the data itself. See [Handles](./handles.md).

```sample
tanstack-start/src/routes/posts.$slug.tsx#route
```

## prefetchEntry or ensureEntry?

Neither is faster: both start the request at the same moment. The difference is what the user sees while it loads:

- **`prefetchEntry` navigates now.** The new page renders at once, and each part still waiting for data shows its nearest [Suspense](https://react.dev/reference/react/Suspense) fallback.
- **`ensureEntry` navigates when the data is in.** Until then the previous page stays on screen. In TanStack Router, a route's [`pendingComponent`](https://tanstack.com/router/latest/docs/guide/data-loading#showing-a-pending-component) replaces it after `pendingMs` (1 second by default).

Choose per query: `ensureEntry` for what the page can't lay out without (the post itself), and `prefetchEntry` for the rest (comments, sidebars, counts).

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

## When to use fetchEntry

`fetchEntry` is `ensureEntry` that also waits on stale data. Use it when the code that starts the query needs the data to be fresh, not just present:

- a loader that must branch on the data, such as a redirect
- outside React, in scripts and tests

In a browser loader, prefer `ensureEntry`: a stale `fetchEntry` blocks the navigation on the refetch, while a stale `ensureEntry` renders the cached data at once and updates when the refetch lands. TanStack Router hides the difference while it still holds the route's last loader data: it renders that and reruns the loader in the background, unless the loader's [`staleReloadMode`](https://tanstack.com/router/latest/docs/guide/data-loading#choosing-background-vs-blocking-stale-reloads) is `"blocking"`, as in the [demo](#prefetchentry-or-ensureentry). There, open a post, go back, and reopen it once its cache is stale.

## Server-only code

React server components and React Router's [`loader`](https://reactrouter.com/start/framework/data-loading#server-data-loading) run only on the server, for every navigation, and each request gets a new client. Its cache starts empty, so every query is a cache miss, so `ensureEntry` and `fetchEntry` wait for the same request every time, and returning to a page waits again.

Use `prefetchEntry` and `fetchEntry` in that code, not `ensureEntry`: `prefetchEntry` for what can stream in behind a Suspense fallback, `fetchEntry` for what the page can't lay out without or the code needs to branch on. See [React Server Components](./react-server-components.md#pages) and [React Router](./react-router.md#server-loaders).

A client-only React Router app is different: its [`clientLoader`](https://reactrouter.com/start/framework/data-loading#client-data-loading)s run in the browser on the tab's client, which keeps its cache between navigations, so there `ensureEntry` holds up only the first visit, as in TanStack Router. See [React Router](./react-router.md#client-loaders).

## Behavior

- Every entry dedupes against the cache: a request already in flight for the entry is joined, not repeated.
- Loaders run on every navigation (TanStack Router reruns them when [its own `staleTime`](https://tanstack.com/router/latest/docs/guide/data-loading#using-staletime-to-control-how-long-data-is-considered-fresh) has passed, `0` by default), so returning to a page shows what's cached at once and then fresh data. With [`defaultPreload: "intent"`](https://tanstack.com/router/latest/docs/guide/preloading), also set [`defaultPreloadStaleTime: 0`](https://tanstack.com/router/latest/docs/guide/preloading#built-in-preloading-freshness-and-retention): otherwise the router reuses a hover's preload for 30 seconds instead of running the loader on click, and the query cache never hears about the navigation.
- On the server, `prefetchEntry` and `ensureEntry` reuse cached data whatever `staleTime` says, even after an [invalidation](./query-invalidation.md#invalidation-on-the-server). `fetchEntry` still waits for fresh data.
- A [browser-only query](./ssr-and-hydration.md#browser-only-queries) never runs on the server: start it with `prefetchEntry` there. A load with an `ensureEntry` or `fetchEntry` for it rejects with `QueryDisabledError`.
- A failed `prefetchEntry` never makes the load reject. The error surfaces where the data is read.
- A failed `ensureEntry` or `fetchEntry` makes the load reject, so it reaches the route's error boundary. An [expected error](./query-functions.md#expected-errors) rejects it with a `QueryFailure`.

## Preloading on intent

Outside loaders, call `load` yourself. Starting a query when the pointer enters a link means the click finds it cached or in flight:

```sample
tanstack-start/src/docs/starting-queries.tsx#preloading-on-intent
```

With TanStack Router's `defaultPreload: "intent"` you get this for free: hovering a link runs its loader, which starts its queries.

Paged factories take a third argument on `ensureEntry` and `fetchEntry`: `{ pages: n }` loads the first `n` pages up front. See [Infinite queries](./infinite-queries.md).
