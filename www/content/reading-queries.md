---
title: Reading queries
description: useQuery returns a stable thenable and the query's state; read it with use() under Suspense, switch on its status, or pass it down to a child.
section: Guides
order: 7
---

Components read queries with `useQuery`, passing the factory and the handle the loader returned:

```sample
tanstack-start/src/docs/reading-queries.ts#intro
```

`postThenable` is a stable `Thenable<Data>` owned by the cache: a `Promise` that also carries `status`, `value` and `reason`, the fields React's [`use()`](https://react.dev/reference/react/use) reads. Read it with `use()` on its own line. When the cache already has the data, the thenable is fulfilled and `use()` returns it synchronously; otherwise `use()` suspends until it lands.

`useQuery` returns a thenable for every handle. A handle from `swr` or `revalidate` had its data loaded before the route rendered, so `use()` doesn't suspend on it. If the cache dropped the data since (garbage collection, `resetOne`, `removeOne`), `use()` suspends while the query refetches. See [Handles](./handles.md#reading-a-handle).

```sample
tanstack-start/src/docs/reading-queries.tsx#post-page
```

`options` takes [`whilePending`](./url-state-and-pagination.md) and `result`, which reads [expected errors](./query-functions.md#expected-errors) as a `Result` instead of throwing them. There is no option to change the input: the handle decides what is read. Settings such as polling belong to the query, as [`meta`](./query-meta.md) in its factory.

## State

| Field               | Meaning                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `isPending`         | No data yet for the handle's input; `use()` on the thenable will suspend                                   |
| `isPrevious`        | The thenable holds the previous handle's data while this handle's query loads (`whilePending: "previous"`) |
| `isFetching`        | A request is in flight: first load, new input, or background refetch                                       |
| `isStale`           | Data is older than `staleTime`, or was invalidated                                                         |
| `error`             | The last request's error while it's the latest outcome: a `fail()` value or a defect                       |
| `updatedAt`         | When the handle's data was fetched; `0` without data                                                       |
| `queryKey`, `input` | The handle's key and input                                                                                 |
| `hash`              | Stable string form of the handle's key, for `key` props on Suspense boundaries                             |
| `refetch()`         | Refetch now. Returns a promise, so it can be awaited inside a transition or action                         |

Paged factories read with `useInfiniteQuery`, whose state adds `fetchNextPage()`, `fetchPreviousPage()`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage` and `isFetchingPreviousPage`. See [Infinite queries](./infinite-queries.md).

## Updates never suspend

When the cache updates — refetch, invalidation, `setData` — the hook returns a new, fulfilled thenable and the component re-renders without suspending. New data is structurally shared with the old: a refetch that returns equal data keeps the same thenable and the same objects, so memoized children don't re-render. See [Render optimizations](./render-optimizations.md).

## Errors

When the **first** load fails, the thenable rejects and `use()` throws to the nearest error boundary. A failed **background** refetch doesn't throw: the old data stays on screen and the state's `error` holds the error, so the component can show it next to the data. [Retries](./retries.md) has a demo of both.

An [expected error](./query-functions.md#expected-errors) (`fail()`) throws a `QueryFailure`. Read it as a value with `{ result: true }`, or catch it by tag with `QueryBoundary` from `@raf-query/boundary`, whose `retry` refetches the query and renders the children again. With another error boundary, call `resetOne(qc, factory, input)` before resetting it, so the query loads again instead of throwing the same error.

## Passing thenables down

A component can call the hook with a prefetched handle and hand the thenable to a child, so only the child suspends:

```sample
tanstack-start/src/docs/reading-queries.passing-thenables-down.tsx#passing-thenables-down
```

The component that calls `useQuery` re-renders when its thenable changes, and when a state field it read changes, such as `isFetching` during a background refetch. A parent that should stay put can pass the handle down instead, so only the child reads the query. See [Tracked state](./render-optimizations.md#tracked-state).

Because `use()` can be called conditionally, a component can also decide **whether** to read:

```sample
tanstack-start/src/docs/reading-queries.tsx#details
```

## No refetch on mount

`useQuery` never refetches stale data on mount: whatever started the query decides. Stale data refetches when a loader or server component starts the query again, when it's [invalidated](./query-invalidation.md) (a reader that mounts after an invalidation refetches it), on `refetch()`, and with the client's features: [window focus](./window-focus-refetching.md) and reconnect refetching, and [polling](./polling.md). A reader only fetches on its own when the query has no data, which is a [waterfall](./request-waterfalls.md).

That means rendering the same handle in many components is free: they share one entry and one request. See [Background fetching indicators](./background-fetching-indicators.md) to show when a refetch is running.
