---
title: Reading queries
description: Handles carry a query from where it started to the components that read it; useQuery returns a stable thenable to read with use() under Suspense, and the query's state.
section: Guides
order: 6
---

Components read the queries a loader or server component started. What they get from it is a **handle**, and what they read it with is `useQuery`:

```sample
tanstack-start/src/docs/reading-queries.ts#intro
```

## Handles

A handle is a query's key and its factory's input, and nothing else:

```sample
tanstack-start/src/docs/reading-queries.handles.ts#intro
```

It carries no data, so it serializes for free: TanStack Router's serializer, React Router's loader data and the RSC payload all send it as is. The data reaches the browser's cache through [hydration](./ssr-and-hydration.md), once, however many handles point at it.

- **Every entry gives the same `QueryHandle`**, whether `load` waited for it or not. A prop typed `QueryHandle<typeof postQuery>` takes either, so switching a loader from `prefetch` to `swr` changes nothing in the components.
- **A handle's type names its factory**, key shape included (`readonly ["posts", "bySlug", string]`). Passing a `postQuery` handle to `useQuery(draftQuery, …)` is a type error, even when both take the same input and return the same data.
- **You never build one by hand.** `load` returns them, and [`waterfallHandle`](./request-waterfalls.md#render-time-inputs-waterfallhandle) makes one for a query that starts while rendering. Both guarantee the key and the input agree.

`useQuery` takes the factory as well as the handle because the handle is plain data that crosses from a server to the browser, and a function can't: the handle can't carry the `queryFn`, so the factory comes alongside it.

## Thenables and use()

`useQuery(factory, handle)` returns `[thenable, state]`. The thenable is a stable `Thenable<Data>` owned by the cache: a `Promise` that also carries `status`, `value` and `reason`, the fields React's [`use()`](https://react.dev/reference/react/use) reads. When the cache already has the data, `use()` returns it synchronously; otherwise it suspends until the data lands.

What started the query decides which happens:

```sample
tanstack-start/src/docs/reading-queries.handles.tsx#reading-a-handle
```

A full page reads its waited-for query directly, and puts the streamed one behind its own Suspense boundary:

```sample
tanstack-start/src/docs/reading-queries.tsx#post-page
```

`useQuery` returns a thenable even for a query the page waited for, because the loader can't promise the data is still there by the time a component renders: the entry may have been garbage-collected, reset or removed since. Then `use()` suspends while the query refetches, instead of returning `undefined`.

Paged factories read with `useInfiniteQuery`, which works the same way. See [Infinite queries](./infinite-queries.md).

## The cache is the source of truth

`load`'s `data` is what the cache held when it resolved. `useQuery` reads the entry as it is now: after a refetch, an invalidation or a `setData`, every reader updates.

**Updates never suspend.** When the cache updates, the hook returns a new, already fulfilled thenable, and the component re-renders without showing a fallback. A refetch that returns equal data keeps the same thenable and the same objects, so memoized children don't re-render. See [Render optimizations](./render-optimizations.md).

## State

| Field               | Meaning                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `isPending`         | No data yet for the handle's input; `use()` on the thenable will suspend                                   |
| `isPrevious`        | The thenable holds the previous handle's data while this handle's query loads (`whilePending: "previous"`) |
| `isFetching`        | A request is in flight: first load, new input, or background refetch                                       |
| `isStale`           | Data is older than `staleTime`, or was invalidated                                                         |
| `error`             | The last request's error while it's the latest outcome                                                     |
| `updatedAt`         | When the handle's data was fetched; `0` without data                                                       |
| `queryKey`, `input` | The handle's key and input                                                                                 |
| `hash`              | Stable string form of the handle's key, for `key` props on Suspense boundaries                             |
| `refetch()`         | Refetch now. Returns a promise, so it can be awaited inside a transition or action                         |

The state is tracked: a component re-renders when its thenable changes, or when a field it read while rendering changes. One that never reads `isFetching` doesn't re-render while a background refetch runs. See [Tracked state](./render-optimizations.md#tracked-state).

The one option, `whilePending`, picks what shows while a new handle loads: see [Pagination and URL state](./url-state-and-pagination.md). There's no option to change the input, because the handle decides what's read, and per-query settings such as polling are [options](./plugins.md) in the factory.

## Errors

When the **first** load fails, the thenable rejects and `use()` throws to the nearest error boundary. A failed **background** refetch doesn't throw: the old data stays on screen and the state's `error` holds the error. Before resetting the error boundary, start the query again, so it doesn't throw the same error. [Retries and errors](./retries.md#showing-errors) has both cases and a demo.

To handle a first load's error in place, read the thenable's `status` and `reason` instead of calling `use()`. See [Reading without Suspense](./comparison.md#reading-without-suspense).

## Passing thenables down

A component can call the hook with a prefetched handle and hand the thenable to a child, so only the child suspends:

```sample
tanstack-start/src/docs/reading-queries.passing-thenables-down.tsx#passing-thenables-down
```

Because `use()` can be called conditionally, a component can also decide **whether** to read:

```sample
tanstack-start/src/docs/reading-queries.tsx#details
```

## No refetch on mount

Reading never refetches stale data. A component that mounts with cached data renders it and starts no request: whatever started the query decides freshness. Stale data refreshes when a loader or server component starts the query again, when it's [invalidated](./query-invalidation.md), on `refetch()`, and with the client's [focus and reconnect refetching](./window-focus-refetching.md) and [polling](./polling.md).

A reader fetches on its own only when the query has no data at all, which is a [waterfall](./request-waterfalls.md). So rendering the same handle in many components is free: they share one entry and one request.
