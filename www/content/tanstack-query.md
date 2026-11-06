---
title: Migrating from TanStack Query
description: Move a TanStack Query app to raf-query one screen at a time, with tanstackQuerySync() keeping both caches in sync.
section: Integrations
order: 4
---

An app on [TanStack Query](https://tanstack.com/query/latest) doesn't have to move to raf-query in one go. The `tanstackQuerySync()` feature keeps raf-query's cache and a TanStack Query [`QueryClient`](https://tanstack.com/query/latest/docs/reference/QueryClient) in sync, so a screen on raf-query and a screen still on TanStack Query show the same data. Move one screen, ship it, and move the next.

For how the two APIs map onto each other, see [Coming from TanStack Query](./comparison.md).

## Setup

Make both clients together, and give raf-query's the TanStack Query client through `tanstackQuerySync()`, from `@raf-query/react/tanstack-query`. Then provide both: TanStack Query's [`QueryClientProvider`](https://tanstack.com/query/latest/docs/framework/react/reference/QueryClientProvider) for the screens still on it, and raf-query's for the ones on raf-query:

```sample
tanstack-start/src/docs/tanstack-query.tsx#setup
```

On the server, make the pair once per request, like any query client. The sync is a feature, so it runs while `QueryClientProvider` has the client mounted: in the browser, not on the server.

`@raf-query/react/tanstack-query` depends on no TanStack package. It takes any object with the `QueryClient` methods it uses, typed as `QueryClientLike`, so it works with the TanStack Query version your app installs.

## Moving a screen

The two caches match queries by key. Write the raf-query factory with the **same `queryKey`** the TanStack Query screens use:

```sample
tanstack-start/src/docs/tanstack-query.tsx#same-key
```

The screen on raf-query starts the query in its loader, as any raf-query route does:

```sample
tanstack-start/src/docs/tanstack-query.tsx#loader
```

A screen still on TanStack Query keeps its [`useQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery) as it is:

```sample
tanstack-start/src/docs/tanstack-query.tanstack.tsx#screen
```

Both read one copy of the post:

- When raf-query's loader has the post, the TanStack Query screen renders it at once, without a loading state.
- When TanStack Query fetched it first, `ensureEntry` takes it from the cache instead of fetching again.
- A write on either side, such as raf-query's `setData` or TanStack Query's [`setQueryData`](https://tanstack.com/query/latest/docs/reference/QueryClient#setquerydata), shows on both screens.

TanStack Query refetches a query when a screen mounts if its data is stale, and its default `staleTime` is `0`. Give it a `staleTime` (the setup above sets one for every query), so a screen that mounts on data raf-query just loaded doesn't fetch it again.

Keep the key as TanStack Query has it until the last screen that reads the query is on raf-query. Then you can move it under a [group](./query-keys.md#groups), which `invalidateMany` matches by the key's first segment.

## Invalidation

Invalidate from whichever side the code is on. The other cache marks its copy stale too:

```sample
tanstack-start/src/docs/tanstack-query.tsx#invalidate
```

Only one cache refetches. When raf-query reads the query, raf-query refetches it and TanStack Query gets the result; otherwise TanStack Query refetches it if a screen there is active. A copy nothing reads is refetched the next time something reads it.

What each side's invalidation reaches:

- TanStack Query's [`invalidateQueries`](https://tanstack.com/query/latest/docs/reference/QueryClient#invalidatequeries) with a key prefix reaches every matching query in its cache, and the sync passes each one on.
- raf-query's `invalidateOne` and groups match by key, so they reach copies the sync made too.
- raf-query's `invalidateMany(queryClient, factory)` matches by factory, so it reaches only the entries that factory has read on this client. A query that only TanStack Query screens have read isn't covered. While both sides show a factory's queries, invalidate them by key: `invalidateOne`, a group, or `invalidateQueries`.

## What syncs

| In one cache                                                                                                                              | In the other                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data, from a request or a write                                                                                                           | The same data, with the same `updatedAt` (`dataUpdatedAt` in TanStack Query)                                                                        |
| An error                                                                                                                                  | The same error, if the other cache has the query. A `fail()` value reaches TanStack Query as a `QueryFailure`, and comes back as the `fail()` value |
| An invalidation                                                                                                                           | The query is stale, and one of the two refetches it                                                                                                 |
| A reset (`resetOne`, [`resetQueries`](https://tanstack.com/query/latest/docs/reference/QueryClient#resetqueries))                         | The other copy is reset                                                                                                                             |
| A removal (`removeOne`, [`removeQueries`](https://tanstack.com/query/latest/docs/reference/QueryClient#removequeries), gc)                | The other copy is removed, unless something reads it there                                                                                          |
| Hydration ([TanStack Query's](https://tanstack.com/query/latest/docs/framework/react/guides/ssr#using-the-hydration-apis) or raf-query's) | The hydrated data, like any other write                                                                                                             |

When the sync starts, it merges the two caches: a query only one has is copied to the other, and where both have data, the newer `updatedAt` wins. So each cache can dehydrate and hydrate on its own in a server-rendered app, and the browser ends up with one copy.

Removing a copy the sync made, or its gc, leaves the original. Each copy has its own `gcTime`, and the sync makes a new copy when the original changes.

## What doesn't map

- **Requests.** Each cache runs its own `queryFn`. A request in flight, its `signal`, retries and `isFetching` stay in the cache that started it. Two screens that start the same query at once, one on each side, make two requests; the one that lands last wins.
- **Options.** `staleTime`, `gcTime`, `enabled`, `select`, `meta` and the rest stay with each side's definition. Only state crosses.
- **`undefined` data.** raf-query caches it; TanStack Query doesn't take it, so the TanStack Query copy is left as it is.
- **An error with nothing to attach to.** An error reaches the other cache only when that cache already has the query.
- **Infinite queries** sync their `{ pages, pageParams }` data, but a page fetch runs in the cache that asked for it, with that side's page params.
- **Mutations.** TanStack Query's mutation cache has no counterpart: raf-query writes are Actions. Invalidate or write after a mutation, and the sync carries the result.
- **Paused queries and `fetchStatus`.** raf-query has no offline pause.

## Choosing what syncs

Every key syncs by default. Pass `filter` to leave some out, such as data one side owns, or a key with values that don't serialize:

```sample
tanstack-start/src/docs/tanstack-query.tsx#filter
```

## When the last screen moves

Once no screen reads from TanStack Query, take `tanstackQuerySync()` out of the client's features, and remove TanStack Query's provider and client. Nothing else changes: the factories and loaders you wrote are plain raf-query.
