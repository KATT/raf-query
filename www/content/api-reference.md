---
title: API reference
description: Every export of @raf-query/react, its TanStack Router subpath and @raf-query/core, with query options and their defaults.
section: Reference
order: 1
---

raf-query's API is functions, not methods: the client is a cache you pass to `load` and to the verbs. `@raf-query/react` re-exports everything from `@raf-query/core`, so apps import from one place.

## The client

```sample
tanstack-start/src/docs/api-reference.ts#createqueryclient
```

| Export                                                                     | Use                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createQueryClient(config?)`                                               | Make a query cache. `config`: `parts`, `defaults`, `isServer`, `clock`. [Important defaults](./important-defaults.md)                                                                                                                                                                  |
| `recommended()`, `Recommended`                                             | The parts most apps want, as an array (and its type): `[retry(), focusRefetch(), reconnectRefetch(), polling()]`. Pass it as `parts`, or spread it among your own                                                                                                                      |
| `QueryClient<TTypes>`                                                      | The client type. `createQueryClient` returns one typed by its parts; the bare `QueryClient` stands for any client, and verbs given one take only what needs no part. [Typing options by the client](./links-and-features.md#typing-options-by-the-client)                              |
| `client.subscribe(listener, { signal, replay }?)`                          | Cache events: `added`, `updated`, `removed`, and `readers` (a reader subscribed or left). `replay: true` first sends an `added` for every entry already cached, so a feature that syncs entries starts from what's there                                                               |
| `client.isServer`                                                          | Set from `config.isServer`, else from whether `window` exists. Server clients don't retry, never gc, and reuse cached data. [SSR and hydration](./ssr-and-hydration.md#server-clients)                                                                                                 |
| `part<Decl>({ link?, setup?, context? })`, `Part<Decl>`, `Operation<Decl>` | One piece of a client's behavior: a link that wraps every request, a feature's `setup`, and `context` for every `queryFn`. `Decl` is an interface with the `options` it reads and the `context` it gives; `part<Decl>()` only declares options. [Parts](./links-and-features.md#parts) |
| `Retry`, `Polling`, `FocusRefetch`, `ReconnectRefetch`                     | What the built-in parts declare, to name them in a binding. [Several clients](./links-and-features.md#several-clients)                                                                                                                                                                 |
| `Clock`                                                                    | The type of `config.clock`: time and timers. Pass a fake one in tests. [Testing](./testing.md)                                                                                                                                                                                         |

Parts:

| Export                              | Kind    | Use                                                                                                                                                  |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retry({ attempts, delay, when }?)` | link    | Retry failed requests: 3 attempts, doubling from 1 s up to 30 s. `retry` per query. [Retries](./retries.md)                                          |
| `timeout(ms)`                       | link    | Fail a request with `QueryTimeoutError`, and abort its `signal`, when it takes longer than `ms`                                                      |
| `focusRefetch()`                    | feature | Refetch read, stale queries on window focus; `refetchOnWindowFocus: false` opts a query out. [Window focus refetching](./window-focus-refetching.md) |
| `reconnectRefetch()`                | feature | Refetch read, stale queries when the browser comes back online; `refetchOnReconnect: false` opts a query out                                         |
| `polling()`                         | feature | Refetch read queries every `refetchInterval` ms. [Polling](./polling.md)                                                                             |

## Query factories

| Export                                                                        | Use                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queryOptions(options)`                                                       | Typed options for a query factory, with the core's options. [Query factories](./query-factories.md)                                                                                                            |
| `infiniteQueryOptions(options)`                                               | Typed options for a paged query factory, with the core's options. [Infinite queries](./infinite-queries.md)                                                                                                    |
| `group(name)`, `group(parent, name)`, `Group`                                 | Build flat keys under a path; a group is also a target that covers every key under its path. [Query keys](./query-keys.md#groups)                                                                              |
| `bindQueryOptions<typeof makeQueryClient>()`, `bindInfiniteQueryOptions<…>()` | The builder bound to a client: it takes the options the client's parts declare, and its `queryFn`s get their context. [Typing options by the client](./links-and-features.md#typing-options-by-the-client)     |
| `Optional<Decl>`                                                              | In a library's binding, `bindQueryOptions<Cms & Optional<Retry>>()`: a part whose options its queries set without needing it. [Binding a library to parts](./links-and-features.md#binding-a-library-to-parts) |
| `OptionsOf<typeof makeQueryClient>`                                           | The options a bound builder lets a query set, for a fragment several factories share. [Options several factories share](./links-and-features.md#options-several-factories-share)                               |
| `DataOf<TFactory>`, `InputOf<TFactory>`                                       | A factory's data and input types                                                                                                                                                                               |
| `QueryOptions`, `CoreOptions`, `QueryFunctionContext`, `StreamOptions`        | Option types. `CoreOptions` is `staleTime`, `gcTime`, `structuralSharing` and `ssr`. The context has `client`, `queryKey`, `signal` and what the client's parts give                                           |
| `InfiniteQueryOptions`, `InfiniteQueryFunctionContext`, `InfiniteData`        | Paged option types. The context adds `pageParam` and `direction`; the data is `{ pages, pageParams }`                                                                                                          |
| `QueryFactory`, `QueryKey`                                                    | A function of an input that returns query options, and a key: any plain array                                                                                                                                  |
| `QueryOptionsBuilder`, `InfiniteQueryOptionsBuilder`                          | The types of the builders, bound or not                                                                                                                                                                        |

Query options, for `queryOptions` and `infiniteQueryOptions`:

| Option                                                                                                                               | Default                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `queryKey`                                                                                                                           | Required. [Query keys](./query-keys.md)                                     |
| `queryFn`                                                                                                                            | Required. [Query functions](./query-functions.md)                           |
| `staleTime`                                                                                                                          | The client's default, else `0` ms                                           |
| `gcTime`                                                                                                                             | The client's default, else 5 minutes; never on the server                   |
| `structuralSharing` (keep deeply equal parts of data)                                                                                | The client's default, else `true`                                           |
| `select` (derive what readers get from the data)                                                                                     | None                                                                        |
| `stream` (`{ initial, reduce }`, for a `queryFn` that returns an async iterable)                                                     | None. [Query functions](./query-functions.md#streaming)                     |
| `ssr` (`false`: only a browser runs it)                                                                                              | `true`. [Browser-only queries](./ssr-and-hydration.md#browser-only-queries) |
| An option a part of the client declares, such as `retry`, on a [bound builder](./links-and-features.md#typing-options-by-the-client) | The client's default, else the part's                                       |

`infiniteQueryOptions` also takes `initialPageParam`, `getNextPageParam`, `getPreviousPageParam`, [`keepPages`](./infinite-queries.md#opening-at-an-item) and `maxPages`.

## Starting queries

```sample
tanstack-start/src/docs/api-reference.ts#load
```

| Export                                     | Use                                                                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load(client, entries)`                    | Start every entry, then resolve with `[handles, data]`. Rejects when an `swr` or `revalidate` entry fails. [Starting queries](./starting-queries.md)                                      |
| `prefetch(factory, input, options?)`       | Start the query if the cache has no fresh data; never waits                                                                                                                               |
| `swr(factory, input, options?)`            | Wait only when the cache has no data; stale data resolves at once and refetches                                                                                                           |
| `revalidate(factory, input, options?)`     | Wait for fresh data; fresh cached data resolves without a refetch                                                                                                                         |
| `skipToken`                                | In place of an entry: start nothing. Its handle is `undefined` and `data` has no key for it. [Conditional queries](./starting-queries.md#conditional-queries)                             |
| `waterfallHandle(factory, input)`          | The handle of a query whose input is only known while rendering. [Request waterfalls](./request-waterfalls.md)                                                                            |
| `waterfallHandle(factory, handle, update)` | A handle with `update(handle.input)` as its input, or `handle` itself while that maps to the same query. [URL state](./url-state-and-pagination.md#input-typed-before-it-reaches-the-url) |
| `QueryHandle<TFactory>`                    | `{ queryKey, input }`, serializable; what `load` returns for every entry but a `skipToken`. [Handles](./reading-queries.md#handles)                                                       |
| `LoadEntry`, `Loaded`, `LoadEntryOptions`  | Entry and result types. `LoadEntryOptions` is `{ pages }`: how many pages a paged factory's first load fetches                                                                            |

## Reading queries

```sample
tanstack-start/src/docs/api-reference.ts#usequery
```

`useQuery(factory, handle, options?)` returns a `Thenable<Data>` for every handle, next to its state. Read it with `use()`, which returns at once when the data is cached and suspends otherwise. A query nothing loaded fetches while rendering in the browser; on the server it [renders its Suspense fallback](./ssr-and-hydration.md#queries-nothing-started-on-the-server). It takes factories that aren't paged. The hooks belong in client components: in a server component each throws. [Reading queries](./reading-queries.md)

Options:

| Option         | Use                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| `whilePending` | `"suspend"` (the default) shows the Suspense fallback for a new input; `"previous"` keeps the last data |

| Control             | Meaning                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `isPending`         | No data yet for the handle's input; `use()` on the thenable will suspend                    |
| `isPrevious`        | Showing the previous handle's data while the new one loads (`whilePending: "previous"`)     |
| `isFetching`        | A request is in flight: first load, new input, or background refetch                        |
| `isStale`           | Data is older than `staleTime`, or invalidated                                              |
| `error`             | The last request's error while it's the latest outcome. Existing data stays readable        |
| `updatedAt`         | When the data was fetched; `0` without data                                                 |
| `queryKey`, `input` | The handle's key and input                                                                  |
| `hash`              | Stable string form of the handle's key, for `key` props on Suspense boundaries              |
| `refetch()`         | Fetch again, or join the request in flight. Returns a promise that resolves when it settles |

The state is tracked. The component re-renders when the thenable changes or settles, or when a field it read while rendering changes. The state object keeps its identity until then, and its functions keep theirs while the component is mounted. A field read only in an effect or a handler isn't tracked and holds its value from the last render. [Tracked state](./render-optimizations.md#tracked-state)

`useInfiniteQuery(factory, handle, options?)` reads a paged factory the same way, with the same options. Its state adds core's `PageControls`: `fetchNextPage()`, `fetchPreviousPage()`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage` and `isFetchingPreviousPage`, and it's tracked the same way: a component that reads only the pages doesn't re-render while another page loads, and one that reads `isFetchingNextPage` does. [Infinite queries](./infinite-queries.md)

Read the thenable's `status`, `value` and `reason` to render without Suspense. See [Reading without Suspense](./comparison.md#reading-without-suspense).

| Export                                                                                          | Use                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useIsFetching(target?)`                                                                        | How many queries have a request in flight: all, or a factory's, group's or target's. `0` on the server. [Background fetching indicators](./background-fetching-indicators.md) |
| `QueryState`, `InfiniteQueryState`, `PageControls`, `QueryValue`, `UseQueryOptions`, `Thenable` | Types of what `useQuery` and `useInfiniteQuery` take and return                                                                                                               |

## Changing the cache

Each verb takes the client first. A factory matches the queries it built: all of them, or those whose input matches a partial input (`PartialInput<TFactory>`, part of the factory's input, whatever its key looks like). A group matches the keys that start with its path. A target (`{ where }`, such as a tag) matches the queries its `where` picks. [Query invalidation](./query-invalidation.md)

| Export                                                                                       | Use                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalidateOne(client, factory, input)`                                                      | Mark one query stale. If it's read, it refetches; resolves when that settles                                                                  |
| `invalidateMany(client, factory, partial?)` / `(client, group)` / `(client, target, param?)` | Mark many queries stale; read ones refetch                                                                                                    |
| `invalidateMany(client, [target, [factory, partial], [target, param], …])`                   | Several targets in one call: each read query they cover refetches once, side by side; resolves when all settle                                |
| `invalidateAll(client)`                                                                      | Mark every query stale; read ones refetch                                                                                                     |
| `resetOne`, `resetMany`, `resetAll`                                                          | Drop data and errors. Read queries suspend and refetch; resolves when they settle. `resetMany` takes a list too                               |
| `removeOne`, `removeMany`, `removeAll`                                                       | Remove entries and abort their requests. `removeMany` takes a list too                                                                        |
| `setData(client, factory, input, updater)` / `(client, factory, updater)`                    | Write data, as if a request had just returned it. A factory without an input takes the second form. [Mutations](./mutations.md)               |
| `getData(client, factory, input)`                                                            | Cached data (before `select`), or `undefined`                                                                                                 |
| `isFetching(client, target?)`                                                                | How many queries have a request in flight                                                                                                     |
| `fetchNextPage(client, factory, input)` / `fetchPreviousPage(…)`                             | Load a page at either end of a paged query, outside React. [Infinite queries](./infinite-queries.md#outside-react)                            |
| `hasNextPage(client, factory, input)` / `hasPreviousPage(…)`                                 | Whether a paged query has a page at that end. [Infinite queries](./infinite-queries.md#outside-react)                                         |
| `ClientFor<TFactory>`, `PartialInput<TFactory>`, `Target`, `QueryInfo`, `Group`              | Types the verbs take. `ClientFor` is a client that runs the factory. `QueryInfo` is what `where` sees: `queryKey`, `input`, `data`, `options` |

## Errors

| Export              | Use                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `QueryTimeoutError` | What a request fails with when `timeout()` cuts it off                                          |
| `abortError()`      | Makes the `AbortError` (a `DOMException`) that a `load` waiting on a removed query rejects with |

## Providers

| Export                                         | Use                                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QueryClientProvider`                          | Provides a client to the tree, and runs its features while mounted. In every framework; see [the provider](./ssr-and-hydration.md#the-provider)                  |
| `useQueryClient()`                             | Read the client, typed as any client                                                                                                                             |
| `bindUseQueryClient<typeof makeQueryClient>()` | `useQueryClient`, typed with the app's client, so verbs take its factories. [Typing options by the client](./links-and-features.md#typing-options-by-the-client) |
| `HydrationBoundary`                            | Writes server data into the client: a loader's `state`, or in server components the request's `client`. [React Router](./react-router.md)                        |

## Hydration and devtools

Also on the main entry. An app that doesn't import them doesn't bundle them.

| Export                                                                                                       | Use                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `dehydrate`, `dehydrateStream`, `hydrate`, `canDehydrate`, `RedactedError`, and their option and state types | Move a cache to the browser without an integration. [SSR and hydration](./ssr-and-hydration.md) |
| `QueryDevtools`, `QueryDevtoolsPanel`                                                                        | [Devtools](./devtools.md)                                                                       |

`@raf-query/core` exports the same, except the devtools, for code that doesn't use React.

## TanStack Router

| Entry                              | Exports                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `@raf-query/react/tanstack-router` | `setupRouterIntegration({ queryClient, router, dehydrateOptions?, handleRedirects? })`. [TanStack Start](./tanstack-start.md) |
