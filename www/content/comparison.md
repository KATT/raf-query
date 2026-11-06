---
title: Coming from TanStack Query
description: How TanStack Query's APIs map onto raf-query, what stays the same, what changes about where queries start, and what we leave out on purpose.
section: Getting started
order: 4
---

raf-query's cache is modelled on [TanStack Query](https://tanstack.com/query)'s: query keys, request deduping, `staleTime` and `gcTime`, structural sharing, infinite pages, and opt-in retries and refetching on focus and reconnect. If you know how TanStack Query caches, you know how raf-query caches.

What changes is the API around the cache. TanStack Query lets any component start a query by rendering `useQuery`. raf-query moves the start to the route: loaders and server components start queries with `load`, and components only read them. Everything that changes the cache is a function that takes the client, such as `invalidateMany(queryClient, todos)`, instead of a method on it.

## API map

| TanStack Query                                       | raf-query                                                                          | Notes                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new QueryClient({ defaultOptions })`                | `createQueryClient({ ...recommended(), staleTime })`                               | Retries and refetching are links and features you opt into. [Important defaults](./important-defaults.md)                                             |
| `queryOptions({ queryKey, queryFn })`                | `function q(input) { return queryOptions({ ... }) }`                               | A [factory](./query-factories.md) of one input, so handles can carry the input                                                                        |
| `queryClient.prefetchQuery()` (not awaited)          | `load(qc, { name: prefetchEntry(factory, input) })`                                | Resolves with a handle. [Starting queries](./starting-queries.md)                                                                                     |
| `queryClient.ensureQueryData({ revalidateIfStale })` | `load(qc, { name: ensureEntry(factory, input) })`                                  | Resolves with a `DefinedQueryHandle` and the data                                                                                                     |
| `queryClient.fetchQuery()`                           | `load(qc, { name: fetchEntry(factory, input) })`                                   | Same, but waits for fresh data                                                                                                                        |
| `useSuspenseQuery()`                                 | `useQuery(factory, handle)` with a `DefinedQueryHandle`, or `use()` on its promise | [Reading queries](./reading-queries.md)                                                                                                               |
| `useQuery()` in render, starting the request         | `useQuery(factory, waterfallHandle(factory, input))`                               | An [escape hatch](./request-waterfalls.md)                                                                                                            |
| `useQuery().data` (doesn't suspend)                  | `promise.status === "fulfilled" ? promise.value : undefined`                       | [Reading without Suspense](#reading-without-suspense)                                                                                                 |
| `enabled: false`                                     | Same, in `queryOptions`                                                            | Readers suspend until it's enabled; `refetch()` doesn't run it either. [Disabling a query](./query-factories.md#disabling-a-query)                    |
| `enabled: typeof window !== "undefined"`             | Same, in `queryOptions`                                                            | Readers need a Suspense boundary on the server. [Browser-only queries](./ssr-and-hydration.md#browser-only-queries)                                   |
| `useInfiniteQuery()`                                 | `useQuery()` with an `infiniteQueryOptions` factory                                | [Infinite queries](./infinite-queries.md)                                                                                                             |
| `placeholderData: keepPreviousData`                  | `useQuery(f, h, { whilePending: "previous" })`                                     | `isPrevious` instead of `isPlaceholderData`                                                                                                           |
| `throwOnError`                                       | `fail()` in the `queryFn`, `useQuery(f, h, { result: true })`                      | Expected errors are typed values. [Query functions](./query-functions.md#expected-errors)                                                             |
| `useMutation()`                                      | Form Actions + `action(write, { invalidates })`                                    | React provides pending and [optimistic](./mutations.md) state                                                                                         |
| `queryClient.invalidateQueries(filters)`             | `invalidateOne`, `invalidateMany`, `invalidateAll`                                 | By factory, [group](./query-keys.md#groups), tag or `where`. Resolves when read queries have refetched. [Query invalidation](./query-invalidation.md) |
| `queryClient.resetQueries` / `removeQueries`         | `resetOne` / `resetMany` / `resetAll`, `removeOne` / `removeMany` / `removeAll`    | The same targets                                                                                                                                      |
| `queryClient.setQueryData` / `getQueryData`          | `setData(qc, factory, input, updater)` / `getData(qc, factory, input)`             |                                                                                                                                                       |
| `useIsFetching()`                                    | `useIsFetching(target?)`                                                           | [Background indicators](./background-fetching-indicators.md)                                                                                          |
| `HydrationBoundary` + `dehydrate()`                  | Automatic streaming with a router integration                                      | [SSR and hydration](./ssr-and-hydration.md)                                                                                                           |
| `cancelQueries()`                                    | `removeOne(...)` / `removeMany(...)`                                               | Removing an entry aborts its request's `signal`                                                                                                       |
| `Register` with `queryMeta`                          | `meta` typed by the client's links and features                                    | [Query meta](./query-meta.md)                                                                                                                         |

## Loading data

### Start queries in the loader

Where a TanStack Query app renders [`useQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery) and lets it fetch, a raf-query route starts the query in its loader and passes the handle down. Pick the entry by what the route needs:

- **`ensureEntry`** when the route can't render without the data. The loader waits for it, and `useQuery` returns the data itself.
- **`prefetchEntry`** when the UI can render without it. The loader doesn't wait, and `useQuery` returns a thenable plus controls.
- **[`enabled: typeof window !== "undefined"`](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries)** for inputs only the browser has, such as [`localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) or the [Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API). The server never runs it or sends it, and the browser does. See [Browser-only queries](./ssr-and-hydration.md#browser-only-queries).
- **`waterfallHandle`** only as a last resort. The component that reads it fetches when it renders, which is a [request waterfall](./request-waterfalls.md).

```sample
tanstack-start/src/routes/posts.$slug.tsx#route
```

### Reading without Suspense

The thenable `useQuery` returns for a prefetch entry's handle is TanStack Query's non-suspending `data`, with no [`use()`](https://react.dev/reference/react/use). Read its `status`:

```sample
tanstack-start/src/docs/comparison.tsx#thenable
```

- `promise.value` is the data once `status` is `"fulfilled"`. `promise.reason` is the error once it's `"rejected"`.
- `controls.isPending` and `controls.isFetching` are the loading state.
- The component re-renders when the first load lands.
- Reading `status` never throws to an error boundary, which suits optional UI.
- Call `use(promise)` instead when you want Suspense. See [Reading queries](./reading-queries.md).

### Side by side

A setting that shows the browser's notification permission. With TanStack Query, the component starts the query, and `enabled` keeps it off the server:

```sample
tanstack-start/src/docs/comparison.tanstack.tsx#tanstack
```

With raf-query, the factory says the query runs in the browser only, and the loader starts it:

```sample
tanstack-start/src/docs/comparison.tsx#queries
```

```sample
tanstack-start/src/docs/comparison.tsx#route
```

The component reads its `status`. On the server, `useQuery` throws for a disabled query with no data, so the reader sits in a Suspense boundary: the server sends the fallback, and the browser renders the permission.

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
- **Queries are matched by factory, not by key prefix.** `invalidateMany(qc, postQuery)` covers the queries that factory built. Groups at the start of a key cover a set of factories, and tags and `where` pick queries by `meta` or data.
- **Expected errors are values.** A `queryFn` returns `fail({ _tag: "NotFound" })`, and its type says which errors a reader can get. Thrown errors stay defects.
- **`meta` is typed by the client.** Links and features declare the `meta` fields they read, and factories tied to that client with `def` are checked against them.
- **`undefined` is a valid result.** A `queryFn` typed `Promise<User | undefined>` caches `undefined` like any other value. TanStack Query treats it as an error.
- **No `placeholderData`.** Use `whilePending: "previous"` to keep showing the last page.
- **`enabled` doesn't wait for input.** Start queries only when the route has their input. `enabled: false` is for a query that's off for now, such as one behind a flag or one only the browser can run.
- **Mutations aren't a hook.** Actions, `useOptimistic` and `useActionState` already give you pending, optimistic and error state. `action()` invalidates after the write.
- **Hydration is a stream.** Handles carry only a key and an input. The server's cache streams to the browser as queries start and settle, and pending queries cross as promises.

## What we leave out

TanStack Query is mature and broad. raf-query is a narrower experiment: what that cache looks like when queries start in loaders and server components, and components only read them. The gaps below are intentional, thinned, or outside that scope.

### Intentional

Things that would undo the render-as-you-fetch shape:

| TanStack Query                                                    | Why raf-query leaves it out                                                                                                                     | Closest substitute                                                                                                              |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `useQuery` that starts a request in render                        | Starting in render is what causes request waterfalls                                                                                            | `load` in a loader or server component · [`waterfallHandle`](./request-waterfalls.md) escape hatch                              |
| `skipToken`, `enabled` waiting for input                          | The route owns the input; if it isn't there yet, don't start the query                                                                          | URL / `loaderDeps` gate the start · [browser-only queries](./ssr-and-hydration.md#browser-only-queries) for browser-only inputs |
| `refetchOnMount` / `retryOnMount`                                 | Mounting a reader must never fetch; whoever started the query decides                                                                           | Loader revalidate · invalidate · focus / reconnect · `refetch()`                                                                |
| Changing input at the read site                                   | Anything that changes what a query fetches lives in the URL so the loader starts the right one                                                  | Search params → loader → new handle                                                                                             |
| Dependent queries as a normal pattern                             | `await`-then-start chains create waterfalls; reshape the route or backend instead                                                               | Route input · backend join · `waterfallHandle` last resort                                                                      |
| Arbitrary `placeholderData`                                       | Only the keep-previous-page case is needed for URL-driven list switches                                                                         | `whilePending: "previous"` + `isPrevious`                                                                                       |
| `useMutation` / MutationCache / mutation keys / offline mutations | React Actions, `useOptimistic` and `useActionState` already cover pending, optimistic UI and errors; the cache only invalidates or writes after | `action(write, { invalidates })` · `setData`                                                                                    |
| Non-suspense status model (`isLoading`, `status`, `fetchStatus`)  | The API is promise-first: the promise carries `status`; controls stay thin (`isPending`, `isFetching`, `isStale`, `error`)                      | [`promise.status`](#reading-without-suspense) · `use(promise)` under Suspense                                                   |
| `useQueries` / `useSuspenseQueries` / `combine`                   | Parallelism belongs in the loader (start every query before awaiting any), not a multi-observer hook                                            | One `load` with several entries. [Starting queries](./starting-queries.md)                                                      |
| Manual `HydrationBoundary` + `dehydrate` as the default path      | Handles carry key + input only; the cache streams. RSC and React Router still use a boundary                                                    | Router stream · [RSC `HydrationBoundary`](./react-server-components.md)                                                         |
| Separate `useInfiniteQuery` / `prefetchInfinite*` verbs           | Paged vs plain is decided only by the factory                                                                                                   | `infiniteQueryOptions` + `useQuery`                                                                                             |

### Thinned

Same problem space, fewer knobs:

| TanStack Query                                                      | What raf-query does instead                                                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `networkMode` (`offlineFirst` / `always`) + `fetchStatus: "paused"` | `retry()` waits while offline before retrying; the first attempt always runs                                    |
| `refetchOnWindowFocus` / `Reconnect`: `'always'` or a function      | `meta.refetchOnWindowFocus: false` opts a query out; otherwise read, stale queries refetch                      |
| `refetchIntervalInBackground`                                       | `meta.refetchInterval` polls while a component reads the query                                                  |
| `initialData` / `initialDataUpdatedAt`                              | Seed with `setData` or hydration, or let the loader fetch                                                       |
| Custom `structuralSharing` merge function                           | Boolean on / off; deep equality on plain objects and arrays                                                     |
| Query filter `type` / `stale` / `fetchStatus` / `predicate`         | Targets: a factory with a partial input, a group, or `{ where(query, param) }` over key, input, data and `meta` |
| `cancelQueries` as its own verb                                     | `removeOne` / `removeMany` abort requests; a `queryFn` gets the `signal`                                        |
| `notifyOnChangeProps`                                               | A reader re-renders when its query's state changes                                                              |
| `throwOnError` as a function                                        | `fail()` values for expected errors, read as a `Result` with `result: true`; other errors throw                 |

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
