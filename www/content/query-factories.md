---
title: Query factories
description: Define each query once as a factory of one serializable input, shared by loaders, server components and components.
section: Guides
order: 4
---

A query is a **factory**: a function of zero or one argument that returns `queryOptions(...)` or `infiniteQueryOptions(...)`. The loader and the component call the same factory, so data types flow end to end.

```sample title="src/queries.ts"
tanstack-start/src/docs/query-factories.ts#intro
```

## One input, serializable

Factories take **at most one argument**; the type rejects two or more. That argument is the query's **input**, and it must be serializable, because it's what a [handle](./handles.md) carries from the loader (or the server) to the component.

Use an object even for one field (`{ slug }`, `{ id }`): it reads well at call sites and leaves room to grow.

```sample
tanstack-start/src/docs/query-factories.one-input-serializable.ts#one-input-serializable
```

A factory with two parameters doesn't type-check where it's used:

```sample
tanstack-start/src/docs/query-factories.two-parameters.ts#two-parameters
```

## The factory decides everything

The factory is the only place a query is declared, including whether it's paged. Every other API — `prefetchEntry`, `ensureEntry`, `fetchEntry`, `waterfallHandle`, `useQuery`, `invalidateOne`, `setData` — takes either kind and infers the rest from the factory's type: the data, the input, the expected errors, and for paged queries the page and page param types.

Options set in the factory override the client's (`staleTime`, `gcTime`, `structuralSharing`):

| Option              | What it does                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `queryKey`          | The cache key; include the input. See [Query keys](./query-keys.md)                                             |
| `queryFn`           | Loads the data. See [Query functions](./query-functions.md)                                                     |
| `select`            | Derives what readers get from the cached data                                                                   |
| `staleTime`         | How long data counts as fresh, in ms                                                                            |
| `gcTime`            | How long an unread entry stays cached, in ms                                                                    |
| `structuralSharing` | See [Render optimizations](./render-optimizations.md)                                                           |
| `enabled`           | `false` keeps the query from running. See [Disabling a query](#disabling-a-query). Default `true`               |
| `stream`            | Folds the chunks of a `queryFn` that returns an async iterable. See [Streaming](./query-functions.md#streaming) |
| `meta`              | Settings for the client's links and features, such as `retry`. See [Query meta](./query-meta.md)                |
| `def`               | Ties the factory to its client's types. See [Typing meta by its root](./query-meta.md#typing-meta-by-its-root)  |

Per-query retries, polling and focus refetching are `meta` fields, read by the link or feature that does them: `meta: { retry: 1 }` with `retry()`, `meta: { refetchInterval: 5000 }` with `polling()`. See [Retries](./retries.md), [Polling](./polling.md) and [Window focus refetching](./window-focus-refetching.md).

`infiniteQueryOptions` also takes `initialPageParam`, `getNextPageParam`, `getPreviousPageParam` and `maxPages`. See [Infinite queries](./infinite-queries.md).

## Disabling a query

As in [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries), set `enabled: false` to keep a query from running, such as a feature behind a flag:

```sample
tanstack-start/src/docs/query-factories.disabling-a-query.ts#disabling-a-query
```

Every call runs the factory again, so `enabled` is decided per call: a later call that returns `true`, such as the loader running after the flag turned on, starts the query. While it's disabled:

- Nothing runs it: not `prefetchEntry`, not its readers, not an invalidation or `refetch()`. A `load` with an `ensureEntry` or `fetchEntry` for it rejects with `QueryDisabledError`, unless an `ensureEntry` finds cached data.
- Readers see `isPending`. In the browser its thenable stays pending, so a reader that calls `use()` shows its Suspense fallback until the query is enabled and loads.

`enabled: typeof window !== "undefined"` disables a query on the server only. See [Browser-only queries](./ssr-and-hydration.md#browser-only-queries).

## Type inference

TypeScript infers the data type from `queryFn`. For paged queries it infers the page type from `queryFn` too, which means `queryFn` must come before `getNextPageParam` in the object literal. If your lint setup sorts keys, annotate the page instead:

```sample
tanstack-start/src/docs/query-factories.one-input-serializable.ts#type-inference
```

To name a factory's types elsewhere:

```sample
tanstack-start/src/docs/query-factories.one-input-serializable.ts#type-helpers
```

`ErrorOf` is the union of the [`fail()` values](./query-functions.md#expected-errors) the `queryFn` returns, and `never` when it returns none. The key's shape is part of the factory's type too (`readonly ["posts", "bySlug", string]`), so handles of two factories with the same input and data are still [different types](./handles.md).

## Factory makers

A library can wrap a typed API in a function that returns a factory, generic over the endpoint. Name the factory it returns, and use that wherever a factory goes; the types flow from the endpoint:

```sample
tanstack-start/src/docs/query-factories.factory-makers.ts#factory-makers
```

Each call of `endpointQuery` returns a new function, but entries are found by `queryKey`, so every call for the same endpoint and args reaches the same entry. Put everything the key depends on in it. [Invalidating](./query-invalidation.md#targets) by factory matches by identity, though, so name the factory once, as here, or invalidate a group in its key.

## Server-only factories

A factory whose `queryFn` imports server-only code (a database client) can't be imported by a client component, so it can't be read with `useQuery` in the browser. Render its data in a server component, or call the database through a server function or an API route so the browser can refetch it. See [React Server Components: server and browser requests](./react-server-components.md#server-and-browser-requests) and [TanStack Start: server and browser requests](./tanstack-start.md#server-and-browser-requests).
