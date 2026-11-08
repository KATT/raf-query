---
title: Coming from TanStack Query
description: How TanStack Query's APIs map onto raf-query, what stays the same, what changes about where queries start, and what we leave out on purpose.
section: Getting started
order: 4
---

raf-query's cache is modelled on [TanStack Query](https://tanstack.com/query)'s: query keys, request deduping, `staleTime` and `gcTime`, structural sharing, infinite pages, and opt-in retries and refetching on focus and reconnect. If you know how TanStack Query caches, you know how raf-query caches.

What changes is the API around the cache. TanStack Query lets any component start a query by rendering `useQuery`. raf-query moves the start to the route: loaders and server components start queries with `load`, and components only read them. Everything that changes the cache is a function that takes the client, such as `invalidateMany(queryClient, posts)`, instead of a method on it.

## API map

| TanStack Query                                                                                                   | raf-query                                                                       | Notes                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new QueryClient({ defaultOptions })`                                                                            | `createQueryClient({ ...recommended(), staleTime })`                            | Retries and refetching are links and features you opt into. [Important defaults](./important-defaults.md)                                             |
| `queryOptions({ queryKey, queryFn })`                                                                            | `function q(input) { return queryOptions({ ... }) }`                            | A [factory](./query-factories.md) of one input, so handles can carry the input                                                                        |
| `queryClient.prefetchQuery()` (not awaited)                                                                      | `load(qc, { name: prefetch(factory, input) })`                                  | Resolves with a handle. [Starting queries](./starting-queries.md)                                                                                     |
| `queryClient.ensureQueryData({ revalidateIfStale })`                                                             | `load(qc, { name: swr(factory, input) })`                                       | Resolves with a handle and the data                                                                                                                   |
| `queryClient.fetchQuery()`                                                                                       | `load(qc, { name: revalidate(factory, input) })`                                | Same, but waits for fresh data                                                                                                                        |
| `useSuspenseQuery()`                                                                                             | `use()` on the thenable `useQuery(factory, handle)` returns                     | [Reading queries](./reading-queries.md)                                                                                                               |
| `useQuery()` in render, starting the request                                                                     | `useQuery(factory, waterfallHandle(factory, input))`                            | An [escape hatch](./request-waterfalls.md)                                                                                                            |
| `useQuery()` refetches stale data on mount (`refetchOnMount: true`)                                              | Reading never refetches; the loader decides freshness                           | Stale data refreshes when the next loader starts it, on invalidation, focus, reconnect or polling. [Important defaults](./important-defaults.md)      |
| `useQuery().data` (doesn't suspend)                                                                              | `switch (postThenable.status)` on the thenable `useQuery` returns               | [Reading without Suspense](#reading-without-suspense)                                                                                                 |
| [`enabled: false`](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries), `skipToken` | `skipToken` in place of a `load` entry                                          | Its handle is `undefined`; render the reader only with a handle. [Conditional queries](./starting-queries.md#conditional-queries)                     |
| `enabled: typeof window !== "undefined"`                                                                         | `waterfallHandle` in a component that renders once hydrated                     | No loader entry. [Browser-only queries](./ssr-and-hydration.md#browser-only-queries)                                                                  |
| `useInfiniteQuery()`                                                                                             | `useInfiniteQuery(factory, handle)` with an `infiniteQueryOptions` factory      | [Infinite queries](./infinite-queries.md)                                                                                                             |
| `placeholderData: keepPreviousData`                                                                              | `useQuery(f, h, { whilePending: "previous" })`                                  | `isPrevious` instead of `isPlaceholderData`                                                                                                           |
| `throwOnError`                                                                                                   | Read the thenable's `status` and `reason` instead of calling `use()`            | A first load's error rejects the thenable, and `use()` throws it to the nearest error boundary. [Reading without Suspense](#reading-without-suspense) |
| `useMutation()`                                                                                                  | Form Actions: `await write()`, then `await invalidateMany(qc, [...])`           | React provides pending and [optimistic](./mutations.md) state                                                                                         |
| `queryClient.invalidateQueries(filters)`                                                                         | `invalidateOne`, `invalidateMany`, `invalidateAll`                              | By factory, [group](./query-keys.md#groups) or `where`. Resolves when read queries have refetched. [Query invalidation](./query-invalidation.md)      |
| `queryClient.resetQueries` / `removeQueries`                                                                     | `resetOne` / `resetMany` / `resetAll`, `removeOne` / `removeMany` / `removeAll` | The same targets                                                                                                                                      |
| `queryClient.setQueryData` / `getQueryData`                                                                      | `setData(qc, factory, input, updater)` / `getData(qc, factory, input)`          |                                                                                                                                                       |
| `useIsFetching()`                                                                                                | `useIsFetching(target?)`                                                        | [Background indicators](./background-fetching-indicators.md)                                                                                          |
| `HydrationBoundary` + `dehydrate()`                                                                              | Automatic streaming with a router integration                                   | [SSR and hydration](./ssr-and-hydration.md)                                                                                                           |
| `cancelQueries()`                                                                                                | `removeOne(...)` / `removeMany(...)`                                            | Removing an entry aborts its request's `signal`                                                                                                       |
| `Register` with `queryMeta`                                                                                      | `meta` typed by the client's links and features                                 | [Query meta](./query-meta.md)                                                                                                                         |

## Loading data

### Start queries in the loader

Where a TanStack Query app renders [`useQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery) and lets it fetch, a raf-query route starts the query in its loader and passes the handle down. Pick the entry by what the route needs:

- **`swr`** when the route can't render without the data. The loader waits for it, and `use()` returns its data without suspending.
- **`prefetch`** when the UI can render without it. The loader doesn't wait, and `use()` suspends until the data lands.
- **`skipToken`** in place of an entry when the route doesn't need the query, such as drafts only an admin sees. Its handle is `undefined`. See [Conditional queries](./starting-queries.md#conditional-queries).
- **`waterfallHandle`** only as a last resort. The component that reads it fetches when it renders, which is a [request waterfall](./request-waterfalls.md). It's also how a component reads data only the browser has, such as [`localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) or the [Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API), once the page has hydrated. See [Browser-only queries](./ssr-and-hydration.md#browser-only-queries).

```sample
tanstack-start/src/routes/posts.$slug.tsx#route
```

### Reading without Suspense

TanStack Query's non-suspending [`useQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery) maps to switching on the status of the thenable raf-query's `useQuery` returns, instead of calling React's [`use()`](https://react.dev/reference/react/use) on it:

```sample
tanstack-start/src/docs/comparison.tsx#thenable
```

- `status` is `"pending"`, `"fulfilled"` or `"rejected"`. `value` is the data once it's `"fulfilled"`, and `reason` is the error once it's `"rejected"`.
- `postState.isFetching` is a background refetch, which keeps `status` at `"fulfilled"`.
- The component re-renders when the first load lands.
- Reading `status` never throws to an error boundary, which suits optional UI.
- Call `use(postThenable)` instead when you want Suspense. See [Reading queries](./reading-queries.md).

### Side by side

A setting that shows the browser's notification permission. With TanStack Query, the component starts the query, and `enabled` keeps it off the server:

```sample
tanstack-start/src/docs/comparison.tanstack.tsx#tanstack
```

With raf-query, the factory is an ordinary one, and no loader starts it: a loader also runs on the server.

```sample
tanstack-start/src/docs/comparison.tsx#queries
```

The handle is built in the browser instead. On the server and while the page hydrates, TanStack Router's [`useHydrated()`](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model#usehydrated-hook) is `false`, and the toggle renders without a permission. Once it's `true`, a child component builds a `waterfallHandle` once and reads it: `useQuery` can't be called conditionally, so the read lives in that child. Reading the handle starts the query, and the toggle re-renders with the permission. The child reads the thenable's `status` instead of calling `use()`, so it never suspends. The server never runs the `queryFn`.

```sample
tanstack-start/src/docs/comparison.tsx#component
```

## What stays the same

- **Query keys** are arrays, hashed deterministically. See [Query keys](./query-keys.md).
- **Caching**: `staleTime: 0` and a `gcTime` of five minutes by default, and structural sharing. See [Important defaults](./important-defaults.md).
- **`recommended()` behaves like TanStack Query's defaults**: three retries with exponential backoff, and refetching read, stale queries on focus and reconnect.
- **Deduping**: every way of starting a query joins a request already in flight for the same key.
- **`select`** derives what readers get from the cached data.
- **Infinite queries** keep `{ pages, pageParams }`, with `getNextPageParam`, `getPreviousPageParam` and `maxPages`.

## What's different

- **Nothing is on by default.** A bare client doesn't retry, refetch on focus or reconnect, or poll. Spread `recommended()` for those, or pick the links and features you want.
- **No refetch on mount.** Mounting a component that reads a query never fetches; whatever started the query decides. Loaders run on every navigation, so returning to a page still revalidates it.
- **The URL is the input.** There is no option to change a read's input. Anything that changes what a query fetches lives in the route, so the loader starts the right query. [URL state and pagination](./url-state-and-pagination.md) shows the pattern.
- **Queries are matched by factory or group, never by a key passed to a verb.** `invalidateMany(qc, postQuery)` covers the queries that factory built. A group builds keys and covers every key that starts with its path, the way a TanStack Query key prefix does. A `where` target picks queries by `meta` or data, which is how an app writes [tags](./query-invalidation.md#tags).
- **`meta` is typed by the client.** Links and features declare the `meta` fields they read, and factories built with `queryOptions` bound to that client are checked against them.
- **`undefined` is a valid result.** A `queryFn` typed `Promise<User | undefined>` caches `undefined` like any other value. TanStack Query treats it as an error.
- **No `placeholderData`.** Use `whilePending: "previous"` to keep showing the last page.
- **No `enabled`.** The loader decides which queries start: `skipToken` in place of an entry starts nothing, and the component renders that query's reader only when it has a handle. Data only the browser has gets its handle in the browser, after hydration.
- **Mutations aren't a hook.** Actions, `useOptimistic` and `useActionState` already give you pending, optimistic and error state. The action awaits the write, then a verb that invalidates what it changed.
- **Hydration is a stream.** Handles carry only a key and an input. The server's cache streams to the browser as queries start and settle, and pending queries cross as promises.

## What we leave out

TanStack Query is mature and broad. raf-query is a narrower experiment: what that cache looks like when queries start in loaders and server components, and components only read them. The gaps below are intentional, thinned, or outside that scope.

### Intentional

Things that would undo the render-as-you-fetch shape:

| TanStack Query                                                    | Why raf-query leaves it out                                                                                                                     | Closest substitute                                                                                                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useQuery` that starts a request in render                        | Starting in render is what causes request waterfalls                                                                                            | `load` in a loader or server component · [`waterfallHandle`](./request-waterfalls.md) escape hatch                                                                                |
| `enabled` waiting for input                                       | The route owns the input; if it isn't there yet, don't start the query                                                                          | URL / `loaderDeps` gate the start · [`skipToken`](./starting-queries.md#conditional-queries) skips an entry · [browser-only queries](./ssr-and-hydration.md#browser-only-queries) |
| `refetchOnMount` / `retryOnMount`                                 | Mounting a reader must never fetch; whoever started the query decides                                                                           | Loader rerun · invalidate · focus / reconnect · `refetch()`                                                                                                                       |
| Changing input at the read site                                   | Anything that changes what a query fetches lives in the URL so the loader starts the right one                                                  | Search params → loader → new handle                                                                                                                                               |
| Dependent queries as a normal pattern                             | `await`-then-start chains create waterfalls; reshape the route or backend instead                                                               | Route input · backend join · `waterfallHandle` last resort                                                                                                                        |
| Arbitrary `placeholderData`                                       | Only the keep-previous-page case is needed for URL-driven list switches                                                                         | `whilePending: "previous"` + `isPrevious`                                                                                                                                         |
| `useMutation` / MutationCache / mutation keys / offline mutations | React Actions, `useOptimistic` and `useActionState` already cover pending, optimistic UI and errors; the cache only invalidates or writes after | A React action that awaits the write, then `invalidateMany` · `setData`                                                                                                           |
| Non-suspense status model (`isLoading`, `status`, `fetchStatus`)  | The API is thenable-first: the thenable carries `status`; the state stays thin (`isPending`, `isFetching`, `isStale`, `error`)                  | [`thenable.status`](#reading-without-suspense) · `use(promise)` under Suspense                                                                                                    |
| `useQueries` / `useSuspenseQueries` / `combine`                   | Parallelism belongs in the loader (start every query before awaiting any), not a multi-observer hook                                            | One `load` with several entries. [Starting queries](./starting-queries.md)                                                                                                        |
| Manual `HydrationBoundary` + `dehydrate` as the default path      | Handles carry key + input only; the cache streams. RSC and React Router still use a boundary                                                    | Router stream · [RSC `HydrationBoundary`](./react-server-components.md)                                                                                                           |
| Separate `prefetchInfinite*` / `fetchInfinite*` verbs             | Loaders and verbs tell paged from plain by the factory; only reading needs its own hook                                                         | `infiniteQueryOptions` + `useInfiniteQuery`                                                                                                                                       |

### Thinned

Same problem space, fewer knobs:

| TanStack Query                                                      | What raf-query does instead                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `networkMode` (`offlineFirst` / `always`) + `fetchStatus: "paused"` | `retry()` waits while offline before retrying; the first attempt always runs                                                                |
| `refetchOnWindowFocus` / `Reconnect`: `'always'` or a function      | `meta.refetchOnWindowFocus: false` opts a query out; otherwise read, stale queries refetch                                                  |
| `refetchIntervalInBackground`                                       | `meta.refetchInterval` polls while a component reads the query                                                                              |
| `initialData` / `initialDataUpdatedAt`                              | Seed with `setData` or hydration, or let the loader fetch                                                                                   |
| Custom `structuralSharing` merge function                           | Boolean on / off; deep equality on plain objects and arrays                                                                                 |
| Query filter `type` / `stale` / `fetchStatus` / `predicate`         | Targets: a factory with a partial input, a group, or `{ where(query, param) }` over key, input, data and `meta`                             |
| `cancelQueries` as its own verb                                     | `removeOne` / `removeMany` abort requests; a `queryFn` gets the `signal`                                                                    |
| `notifyOnChangeProps`                                               | Always tracked: a reader re-renders when its thenable or a state field it read changes                                                      |
| `throwOnError` as a function                                        | `use()` throws a first load's error; read the thenable's `status` to handle it in place, and the state's `error` for a background refetch's |

### Out of scope

| TanStack Query                                                  | Why                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Multi-framework adapters (Vue, Solid, Svelte, Angular, …)       | A React + Suspense / RSC / loader experiment, not a framework-agnostic product |
| `PersistQueryClient` / storage persisters / per-query persister | No offline persistence story; the cache is in-memory plus the SSR stream       |
| Default `queryFn` / `setQueryDefaults` / `getQueryDefaults`     | Every query is an explicit factory; no key → defaultFn registry                |
| Custom `queryKeyHashFn` / precomputed `queryHash`               | One hashing function; keys stay plain arrays                                   |
| `@tanstack/eslint-plugin-query`                                 | Factories and handles carry the constraint instead of lint rules               |
| `isMutating` / mutation filters / dehydrating mutations         | No mutation subsystem                                                          |

## Why a different API?

TanStack Query is excellent, and it runs anywhere a component renders. That flexibility is also what makes waterfalls easy: a component deep in the tree can only start its query once it renders, which is after its parents have loaded. raf-query trades that flexibility for a shape where the route knows every query up front. The cache underneath is the same idea; raf-query just won't let a render start a request unless you build its handle with the function named [`waterfallHandle`](./request-waterfalls.md).
