---
title: Coming from TanStack Query
description: How TanStack Query's APIs map onto raf-query, what stays the same, and what changes about where queries start.
section: Getting started
order: 4
---

raf-query's cache is modelled on [TanStack Query](https://tanstack.com/query)'s: query keys, request deduping, `staleTime` and `gcTime`, retries with backoff, structural sharing, infinite pages, refetching on focus and reconnect. If you know how TanStack Query caches, you know how raf-query caches.

What changes is the API around the cache. TanStack Query lets any component start a query by rendering `useQuery`. raf-query moves the start to the route: loaders and server components start queries, and components only read them.

## API map

| TanStack Query                                       | raf-query                                                   | Notes                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `queryOptions({ queryKey, queryFn })`                | `function q(input) { return queryOptions({ ... }) }`        | A [factory](./query-factories.md) of one input, so handles can carry the input                                                       |
| `queryClient.prefetchQuery()` (not awaited)          | `qc.prefetch(factory, input)` → handle                      | [Starting queries](./starting-queries.md)                                                                                            |
| `queryClient.ensureQueryData({ revalidateIfStale })` | `qc.ensure(factory, input)` → `Promise<EnsuredQueryHandle>` |                                                                                                                                      |
| `queryClient.fetchQuery()`                           | `qc.fetch(factory, input)` → `Promise<Data>`                |                                                                                                                                      |
| `useSuspenseQuery()`                                 | `use(useQuery(factory, handle)[0])`                         | The hook returns a promise; [read it](./reading-queries.md) where you need it                                                        |
| `useQuery()` in render, starting the request         | `useWaterfall(factory, input)` + `useQuery`                 | An [escape hatch](./request-waterfalls.md#render-time-inputs-usewaterfall)                                                           |
| `useInfiniteQuery()`                                 | `useQuery()` with an `infiniteQueryOptions` factory         | [Infinite queries](./infinite-queries.md)                                                                                            |
| `placeholderData: keepPreviousData`                  | `useQuery(f, h, { whilePending: "previous" })`              | `isPrevious` instead of `isPlaceholderData`                                                                                          |
| `useMutation()`                                      | Form Actions + `qc.invalidate()`                            | React provides pending and [optimistic](./mutations.md) state                                                                        |
| `queryClient.invalidateQueries(filters)`             | `qc.invalidate(filter)` or `qc.invalidate(factory, input)`  | Resolves when read queries have refetched                                                                                            |
| `queryClient.resetQueries` / `removeQueries`         | `qc.reset(...)` / `qc.remove(...)`                          | Same [filters](./query-invalidation.md#query-filters)                                                                                |
| `queryClient.setQueryData` / `getQueryData`          | `qc.setData(factory, input, updater)` / `qc.getData(...)`   |                                                                                                                                      |
| `useIsFetching()`                                    | `useIsFetching()`                                           | Kept for compatibility; prefer router pending + per-query `isFetching`. [Background indicators](./background-fetching-indicators.md) |
| `HydrationBoundary` + `dehydrate()`                  | Automatic streaming                                         | [SSR and hydration](./ssr-and-hydration.md)                                                                                          |
| `cancelQueries()`                                    | `qc.remove(...)`                                            | Unread background refetches are [aborted](./query-cancellation.md) for you                                                           |

## What stays the same

- **Query keys** are arrays, hashed deterministically, and matched by prefix in filters. See [Query keys](./query-keys.md).
- **Defaults**: `staleTime: 0`, `gcTime` of five minutes, three retries with exponential backoff, refetch on focus and reconnect, structural sharing. See [Important defaults](./important-defaults.md).
- **Deduping**: every way of starting a query joins a request already in flight for the same key.
- **Infinite queries** keep `{ pages, pageParams }`, with `getNextPageParam`, `getPreviousPageParam` and `maxPages`.

## What's different

- **No refetch on mount.** Mounting a component that reads a query never fetches; whatever started the query decides. Loaders run on every navigation, so returning to a page still revalidates it.
- **The URL is the input.** There is no option to change a read's input. Anything that changes what a query fetches lives in the route, so the loader starts the right query. [URL state and pagination](./url-state-and-pagination.md) shows the pattern.
- **`undefined` is a valid result.** A `queryFn` typed `Promise<User | undefined>` caches `undefined` like any other value. TanStack Query treats it as an error.
- **No `select`, no `enabled`, no `placeholderData`.** Shape data in the `queryFn` or the component; start queries only when the route has their input; use `whilePending: "previous"` to keep showing the last page.
- **Mutations aren't a hook.** Actions, `useOptimistic` and `useActionState` already give you pending, optimistic and error state.
- **Hydration is a stream.** Handles carry only a key and an input. The server's cache streams to the browser as queries settle, and pending queries cross as promises.
- **Browser-only queries are first-class.** `ssr: false` skips the server and runs in the browser — push subscriptions, permissions, service workers — with the same factory and handle API. See [Browser-only queries](./ssr-and-hydration.md#browser-only-queries).

## Why a different API?

TanStack Query is excellent, and it runs anywhere a component renders. That flexibility is also what makes waterfalls easy: a component deep in the tree can only start its query once it renders, which is after its parents have loaded. raf-query trades that flexibility for a shape where the route knows every query up front. The cache underneath is the same idea; raf-query just won't let a render start a request unless you call the function named [`useWaterfall`](./request-waterfalls.md#render-time-inputs-usewaterfall).
