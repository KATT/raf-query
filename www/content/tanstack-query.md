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

The two caches match queries by key. raf-query builds every key with a [group](./query-keys.md#groups), and the key a group builds is a plain array, so a factory can have the **same `queryKey`** the TanStack Query screens use. Make a group for the key's first segments and pass it the rest: `posts("detail", slug)` is `["posts", "detail", slug]`.

```sample
tanstack-start/src/docs/tanstack-query.tsx#same-key
```

The screen on raf-query starts the query in its loader, as any raf-query route does:

```sample
tanstack-start/src/docs/tanstack-query.tsx#loader
```

Its component reads the handle with `useQuery`, and React's [`use()`](https://react.dev/reference/react/use) suspends until the post is there:

```sample
tanstack-start/src/docs/tanstack-query.tsx#screen
```

TanStack Query's [`useQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery) doesn't suspend. For a part of the screen that shouldn't either, switch on the thenable's `status` instead of calling `use()`: see [Reading without Suspense](./comparison.md#reading-without-suspense).

A screen still on TanStack Query keeps its `useQuery` as it is. It can also build its key with the group, `queryKey: posts("detail", slug)`, so the two can't drift apart:

```sample
tanstack-start/src/docs/tanstack-query.tanstack.tsx#screen
```

Both read one copy of the post:

- When raf-query's loader has the post, the TanStack Query screen renders it at once, without a loading state.
- When TanStack Query fetched it first, `swr` takes it from the cache instead of fetching again.
- A write on either side, such as raf-query's `setData` or TanStack Query's [`setQueryData`](https://tanstack.com/query/latest/docs/reference/QueryClient#setquerydata), shows on both screens.

TanStack Query refetches a query when a screen mounts if its data is stale, and its default `staleTime` is `0`. Give it a `staleTime` (the setup above sets one for every query), so a screen that mounts on data raf-query just loaded doesn't fetch it again.

A group's path is strings, so a TanStack Query key that starts with anything else, such as `[{ scope: "posts" }]`, can't come from a group. Give it a string first segment on the TanStack Query side before moving its screens, or leave it out of the sync with `filter`.

## Invalidation

Invalidate from whichever side the code is on. The other cache marks its copy stale too. A group and a TanStack Query key prefix match the same queries, every key that starts with the group's path, so these two lines reach the same posts on both sides:

```sample
tanstack-start/src/docs/tanstack-query.tsx#invalidate
```

Only one cache refetches. When raf-query reads the query, raf-query refetches it and TanStack Query gets the result; otherwise TanStack Query refetches it if a screen there is active. A copy nothing reads is refetched the next time something reads it.

What each side's invalidation reaches:

- TanStack Query's [`invalidateQueries`](https://tanstack.com/query/latest/docs/reference/QueryClient#invalidatequeries) reaches every query in its cache that its `queryKey` matches, by prefix and by the fields of an object segment, and the sync passes each one on. A raf-query entry still loading its first data has no copy in TanStack Query yet, so it isn't reached.
- raf-query's groups and `invalidateOne` match by key, so they reach the copies the sync made too, including queries only TanStack Query screens have read.
- A factory and a [`where` target](./query-invalidation.md#matching-with-where) match by what raf-query knows of a query: its factory, its input and its `meta`. A mirror has none of those until raf-query reads it, so they reach only the entries raf-query has read. Tags are one such target, a few lines over `meta.tags` ([Tags](./query-invalidation.md#tags)), not a core feature. While both sides show a set of queries, invalidate it by group.

## What syncs

| In one cache                                                                                                                              | In the other                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Data, from a request or a write                                                                                                           | The same data, with the same `updatedAt` (`dataUpdatedAt` in TanStack Query) |
| An error                                                                                                                                  | The same error, if the other cache has the query                             |
| An invalidation                                                                                                                           | The query is stale, and one of the two refetches it                          |
| A reset (`resetOne`, [`resetQueries`](https://tanstack.com/query/latest/docs/reference/QueryClient#resetqueries))                         | The other copy is reset                                                      |
| A removal (`removeOne`, [`removeQueries`](https://tanstack.com/query/latest/docs/reference/QueryClient#removequeries), gc)                | The other copy is removed, unless something reads it there                   |
| Hydration ([TanStack Query's](https://tanstack.com/query/latest/docs/framework/react/guides/ssr#using-the-hydration-apis) or raf-query's) | The hydrated data, like any other write                                      |

When the sync starts, it merges the two caches: a query only one has is copied to the other, and where both have data, the newer `updatedAt` wins. So each cache can dehydrate and hydrate on its own in a server-rendered app, and the browser ends up with one copy.

Removing a copy the sync made, or its gc, leaves the original. Each copy has its own `gcTime`, and the sync makes a new copy when the original changes.

## What doesn't map

- **Requests.** Each cache runs its own `queryFn`. A request in flight, its `signal`, retries and `isFetching` stay in the cache that started it. Two screens that start the same query at once, one on each side, make two requests; the one that lands last wins.
- **Options.** `staleTime`, `gcTime`, `select`, `meta` and the rest stay with each side's definition. Only state crosses. TanStack Query's [`enabled`](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries) stays on that side.
- **A skipped entry.** A [`skipToken`](./starting-queries.md#conditional-queries) starts nothing, so there is no entry to mirror. A [browser-only query](./ssr-and-hydration.md#browser-only-queries) has no loader entry either: its handle is built after hydration, and the sync picks the query up once the browser has it.
- **`undefined` data.** raf-query caches it; TanStack Query doesn't take it, so the TanStack Query copy is left as it is.
- **An error with nothing to attach to.** An error reaches the other cache only when that cache already has the query.
- **Infinite queries** sync their `{ pages, pageParams }` data, but a page fetch runs in the cache that asked for it, with that side's page params.
- **Mutations.** TanStack Query's mutation cache has no counterpart. A mutation awaits the write, then `invalidateMany(client, [targets])`. The sync carries that invalidation, and a `setData` from either side.
- **Paused queries and `fetchStatus`.** raf-query has no offline pause.

## Choosing what syncs

Every key syncs by default. Pass `filter` to leave some out, such as data one side owns, or a key with values that don't serialize:

```sample
tanstack-start/src/docs/tanstack-query.tsx#filter
```

## When the last screen moves

Once no screen reads from TanStack Query, take `tanstackQuerySync()` out of the client's features, and remove TanStack Query's provider and client. Nothing else changes: the factories and loaders you wrote are plain raf-query.
