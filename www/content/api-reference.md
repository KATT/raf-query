---
title: API reference
description: Every export of @raf-query/react, its subpaths, @raf-query/core and @raf-query/boundary, with query options and their defaults.
section: Reference
order: 2
---

raf-query's API is functions, not methods: the client is a cache you pass to `load` and to the verbs. `@raf-query/react` re-exports everything from `@raf-query/core`, so apps import from one place.

## The client

```sample
tanstack-start/src/docs/api-reference.ts#createqueryclient
```

| Export                                      | Use                                                                                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createQueryClient(config?)`                | Make a query cache. `config`: `links`, `features`, `staleTime`, `gcTime`, `structuralSharing`, `isServer`, `clock`. [Important defaults](./important-defaults.md)                      |
| `recommended()`                             | `{ links: [retry()], features: [focusRefetch(), reconnectRefetch(), polling(), invalidateOnAction()] }`, to spread into the config                                                     |
| `QueryClient<TTypes>`                       | The client type. Bare `QueryClient` takes a client of any root; verbs take `ClientFor<typeof factory>`. [Query meta](./query-meta.md#typing-meta-by-its-root)                          |
| `client.subscribe(listener, { signal }?)`   | Cache events: `added`, `updated`, `removed`, and `readers` (a reader subscribed or left)                                                                                               |
| `client.isServer`                           | Set from `config.isServer`, else from whether `window` exists. Server clients don't retry, never gc, and reuse cached data. [SSR and hydration](./ssr-and-hydration.md#server-clients) |
| `link(run)`, `Link`, `AnyLink`, `Operation` | Wrap every request, outermost first. `link<{ meta: … }>(run)` declares the `meta` it reads. [Query meta](./query-meta.md#links-and-features)                                           |
| `feature(setup?)`, `Feature`, `AnyFeature`  | A cache-wide behavior, started while a provider mounts the client. `feature<{ meta: … }>()` without `setup` only declares `meta` fields                                                |
| `systemClock`, `Clock`                      | Time and timers; pass a fake `clock` in tests                                                                                                                                          |

Links and features:

| Export                              | Kind    | Use                                                                                                                                                  |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retry({ attempts, delay, when }?)` | link    | Retry failed requests: 3 attempts, doubling from 1 s up to 30 s. `meta.retry` per query. [Retries](./retries.md)                                     |
| `timeout(ms)`                       | link    | Fail a request with `QueryTimeoutError`, and abort its `signal`, when it takes longer than `ms`                                                      |
| `focusRefetch()`                    | feature | Refetch read, stale queries on window focus; `meta.refetchOnWindowFocus: false` opts out. [Window focus refetching](./window-focus-refetching.md)    |
| `reconnectRefetch()`                | feature | Refetch read, stale queries when the browser comes back online; `meta.refetchOnReconnect: false` opts out                                            |
| `polling()`                         | feature | Refetch read queries every `meta.refetchInterval` ms. [Polling](./polling.md)                                                                        |
| `invalidateOnAction({ default }?)`  | feature | Lets `action()` invalidate this client's queries. `default: "active"` (the default) refetches every read query after an action without `invalidates` |
| `groups()`                          | feature | From `@raf-query/react/groups`: gives queries `meta.tags`. [Query invalidation](./query-invalidation.md#tags)                                        |

## Query factories

| Export                                                                      | Use                                                                                                                         |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `queryOptions(options)`                                                     | Typed options for a query factory. [Query factories](./query-factories.md)                                                  |
| `infiniteQueryOptions(options)`                                             | Typed options for a paged query factory. [Infinite queries](./infinite-queries.md)                                          |
| `defType<typeof makeQueryClient>()`                                         | The `def` option: checks a factory's `meta` against a root's. [Query meta](./query-meta.md#typing-meta-by-its-root)         |
| `fail(error)`                                                               | Return an expected error from a `queryFn`: an object with a `_tag`. [Query functions](./query-functions.md#expected-errors) |
| `DataOf<TFactory>`, `InputOf<TFactory>`, `ErrorOf<TFactory>`                | A factory's data, input and `fail()` types                                                                                  |
| `QueryOptions`, `QueryFunctionContext`, `StreamOptions`                     | Option types. The context has `queryKey`, `signal` and `meta`                                                               |
| `InfiniteQueryOptions`, `InfiniteQueryFunctionContext`, `InfiniteData`      | Paged option types. The context adds `pageParam` and `direction`; the data is `{ pages, pageParams }`                       |
| `QueryFactory`, `AnyFactory`, `QueryKey`                                    | A function of an input that returns query options, and a key                                                                |
| `QueryMeta`, `MetaOf`, `Decl`, `Def`, `RootOf`, `RootTypes`, `DefaultTypes` | Types behind root typing                                                                                                    |

Query options, for `queryOptions` and `infiniteQueryOptions`:

| Option                                                                                                                                                     | Default                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `queryKey`                                                                                                                                                 | Required. [Query keys](./query-keys.md)                 |
| `queryFn`                                                                                                                                                  | Required. [Query functions](./query-functions.md)       |
| `staleTime`                                                                                                                                                | The client's, else `0` ms                               |
| `gcTime`                                                                                                                                                   | The client's, else 5 minutes; never on the server       |
| `structuralSharing` (keep deeply equal parts of data)                                                                                                      | The client's, else `true`                               |
| `enabled` (`false`: [the query doesn't run](./query-factories.md#disabling-a-query), such as [on the server](./ssr-and-hydration.md#browser-only-queries)) | `true`                                                  |
| `select` (derive what readers get from the data)                                                                                                           | None                                                    |
| `stream` (`{ initial, reduce }`, for a `queryFn` that returns an async iterable)                                                                           | None. [Query functions](./query-functions.md#streaming) |
| [`meta`](./query-meta.md) (settings for the root's links and features)                                                                                     | None                                                    |
| `def` (`defType<typeof makeQueryClient>()`)                                                                                                                | Any root                                                |

`infiniteQueryOptions` also takes `initialPageParam`, `getNextPageParam`, `getPreviousPageParam` and `maxPages`.

## Starting queries

```sample
tanstack-start/src/docs/api-reference.ts#load
```

| Export                                    | Use                                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `load(client, entries)`                   | Start every entry, then resolve with `[handles, data]`. Rejects when a fetch or ensure entry fails. [Starting queries](./starting-queries.md) |
| `prefetchEntry(factory, input, options?)` | Start the query if the cache has no fresh data; never waits. Its handle is a `QueryHandle`                                                    |
| `ensureEntry(factory, input, options?)`   | Wait only when the cache has no data; stale data resolves at once and refetches. Its handle is a `DefinedQueryHandle`                         |
| `fetchEntry(factory, input, options?)`    | Wait for fresh data. Its handle is a `DefinedQueryHandle`                                                                                     |
| `waterfallHandle(factory, input)`         | The handle of a query whose input is only known while rendering. [Request waterfalls](./request-waterfalls.md)                                |
| `QueryHandle<TFactory>`                   | `{ queryKey, input }`, serializable. [Handles](./handles.md)                                                                                  |
| `DefinedQueryHandle<TFactory>`            | A handle whose query had data when `load` resolved: `{ queryKey, input, defined: true }`                                                      |
| `LoadEntry`, `Loaded`, `EntryOptions`     | Entry and result types. `EntryOptions` is `{ pages }`: how many pages a paged factory's first load fetches                                    |

## Reading queries

```sample
tanstack-start/src/docs/api-reference.ts#usequery
```

`useQuery(factory, handle, options?)` returns a `Thenable<Data>` to pass to `use()`, or the data itself for a `DefinedQueryHandle`, next to its controls. A query nothing loaded fetches while rendering. [Reading queries](./reading-queries.md)

Options:

| Option         | Use                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| `whilePending` | `"suspend"` (the default) shows the Suspense fallback for a new input; `"previous"` keeps the last data |
| `result`       | `true`: read `fail()` values as a `Result` instead of throwing them. Defects still throw                |

| Control             | Meaning                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `isPending`         | No data yet for the handle's input; `use(promise)` will suspend                             |
| `isPrevious`        | Showing the previous handle's data while the new one loads (`whilePending: "previous"`)     |
| `isFetching`        | A request is in flight: first load, new input, or background refetch                        |
| `isStale`           | Data is older than `staleTime`, or invalidated                                              |
| `error`             | The last request's error while it's the latest outcome. Existing data stays readable        |
| `updatedAt`         | When the data was fetched; `0` without data                                                 |
| `queryKey`, `input` | The handle's key and input                                                                  |
| `hash`              | Stable string form of the handle's key, for `key` props on Suspense boundaries              |
| `refetch()`         | Fetch again, or join the request in flight. Returns a promise that resolves when it settles |

Paged factories add `fetchNextPage()`, `fetchPreviousPage()`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage` and `isFetchingPreviousPage`.

The promise is a `Thenable<Data>`: read its `status`, `value` and `reason` to render without Suspense. See [Reading without Suspense](./comparison.md#reading-without-suspense).

| Export                                                                       | Use                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useIsFetching(target?)`                                                     | How many queries have a request in flight: all, or a factory's, group's or target's. `0` on the server. [Background fetching indicators](./background-fetching-indicators.md) |
| `QueryControls`, `PageControls`, `QueryValue`, `UseQueryOptions`, `Thenable` | Types of what `useQuery` takes and returns                                                                                                                                    |

## Changing the cache

Each verb takes the client first. A factory matches the queries it built: all of them, or those whose input matches a partial input. A group matches the keys that start with it. A target (`{ where }`, such as a tag) matches the queries its `where` picks. [Query invalidation](./query-invalidation.md)

| Export                                                                                       | Use                                                                                                   |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `invalidateOne(client, factory, input)`                                                      | Mark one query stale. If it's read, it refetches; resolves when that settles                          |
| `invalidateMany(client, factory, partial?)` / `(client, group)` / `(client, target, param?)` | Mark many queries stale; read ones refetch                                                            |
| `invalidateAll(client)`                                                                      | Mark every query stale; read ones refetch                                                             |
| `resetOne`, `resetMany`, `resetAll`                                                          | Drop data and errors. Read queries suspend and refetch; resolves when they settle                     |
| `removeOne`, `removeMany`, `removeAll`                                                       | Remove entries and abort their requests                                                               |
| `setData(client, factory, input, updater)`                                                   | Write data, as if a request had just returned it. [Mutations](./mutations.md)                         |
| `getData(client, factory, input)`                                                            | Cached data (before `select`), or `undefined`                                                         |
| `isFetching(client, target?)`                                                                | How many queries have a request in flight                                                             |
| `action(write, { invalidates }?)`                                                            | Wrap a write so the cache catches up after it; usable as a React Action. Needs `invalidateOnAction()` |
| `ClientFor<TFactory>`, `PartialInput<TFactory>`, `Target`, `AnyTarget`, `QueryInfo`, `Group` | Types the verbs take. `QueryInfo` is what `where` sees: `queryKey`, `input`, `data`, `meta`           |

## Errors

| Export                  | Use                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `QueryFailure`          | What reading or loading a query throws when its `queryFn` returned `fail()`: an `Error` with the value in `fail` and the query's `hash` |
| `isFail(value, tag?)`   | Whether `value` is a `fail()` value or a `QueryFailure`, optionally with that `_tag`                                                    |
| `failOf(value)`         | The `fail()` value in `value`, unwrapping a `QueryFailure`                                                                              |
| `isQueryFailure(value)` | Whether `value` is a `QueryFailure`                                                                                                     |
| `Fail`, `Result`        | A `fail()` value, and what `useQuery` reads with `result: true`: `{ ok: true, value }` or `{ ok: false, error }`                        |
| `QueryDisabledError`    | Why a disabled query has no data: `load` rejects with it for fetch and ensure entries, and `useQuery` throws it on the server           |
| `QueryTimeoutError`     | What a request fails with when `timeout()` cuts it off                                                                                  |
| `abortError()`          | Makes the `AbortError` (a `DOMException`) that a `load` waiting on a removed query rejects with                                         |

## Providers

| Export                | Use                                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QueryClientProvider` | Provides a client to the tree, and runs its features while mounted                                                                                                                      |
| `useQueryClient()`    | Read the client                                                                                                                                                                         |
| `QueryProvider`       | Provider for React Server Components apps: a client per server render and per browser tab; its server render starts no request. [React Server Components](./react-server-components.md) |
| `HydrationBoundary`   | Writes server data into the client: a loader's `state`, or in server components the request's `client`. [React Router](./react-router.md)                                               |

## Subpaths

| Entry                              | Exports                                                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@raf-query/react/groups`          | `group(name, parent?)`, `tag(name)`, `groups()`, `Group`, `Tag`, `TagsMeta`. [Query keys](./query-keys.md#groups)                                         |
| `@raf-query/react/hydration`       | `dehydrate`, `dehydrateStream`, `hydrate`, `canDehydrate`, `RedactedError`, and their option and state types. [SSR and hydration](./ssr-and-hydration.md) |
| `@raf-query/react/tanstack-router` | `setupRouterIntegration({ queryClient, router, dehydrateOptions?, handleRedirects? })`. [TanStack Start](./tanstack-start.md)                             |
| `@raf-query/react/devtools`        | `QueryDevtools`, `QueryDevtoolsPanel`. [Devtools](./devtools.md)                                                                                          |

`@raf-query/core` has the same `groups` and `hydration` subpaths, for code that doesn't use React.

## @raf-query/boundary

| Export                                | Use                                                                                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QueryBoundary`                       | A Suspense and error boundary for a query's expected errors. `query` types the `catch` handlers, one per `fail()` tag; each gets the value and a `retry`. Other errors go to the next error boundary |
| `QueryBoundaryProps`, `CatchHandlers` | Its prop types                                                                                                                                                                                       |
