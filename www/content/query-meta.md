---
title: Query meta
description: Set per-query options for the client's links and features with meta, declare your own fields, and type meta by the client it belongs to.
section: Guides
order: 20
---

`meta` holds a query's settings for the client's [links and features](#links-and-features), and anything else you want to know about the query elsewhere. It reaches:

- every link, as `op.meta`
- the `queryFn`, as `context.meta`
- `where` targets, as `query.meta`, to [select queries by it](#selecting-queries-by-meta)

The per-query behavior that `recommended()` turns on is set here, and each field is read by the part that does it:

```sample
tanstack-start/src/docs/query-meta.ts#intro
```

| Field                  | Read by              | Use                                                                           |
| ---------------------- | -------------------- | ----------------------------------------------------------------------------- |
| `retry`                | `retry()`            | Attempts for this query, or `false`. See [Retries](./retries.md)              |
| `refetchInterval`      | `polling()`          | Refetch every `n` ms while read. See [Polling](./polling.md)                  |
| `refetchOnWindowFocus` | `focusRefetch()`     | `false` opts out. See [Window focus refetching](./window-focus-refetching.md) |
| `refetchOnReconnect`   | `reconnectRefetch()` | `false` opts out                                                              |
| `tags`                 | `groups()`           | The query's [tags](./query-invalidation.md#tags)                              |

A field does something only when the client has the part that reads it: `meta: { retry: 1 }` on a client without `retry()` is just data.

## Links and features

A client's behavior comes from two kinds of part, both passed to `createQueryClient`:

- A **link** wraps every request, like a [tRPC link](https://trpc.io/docs/client/links): it gets the request as `op` and calls `next(op)` to run the rest of the chain. The last link is the query's own `queryFn`. Links run outermost first. `retry()` and `timeout(ms)` are links.
- A **feature** is a cache-wide behavior. It starts when a provider mounts the client and stops when it unmounts. `focusRefetch()`, `reconnectRefetch()`, `polling()` and `groups()` are features.

Each part declares the `meta` fields it reads, with `link<{ meta: … }>(fn)` or `feature<{ meta: … }>(setup)`. A feature without `setup` only declares fields: an app's own data, for targets to match on. Here a link toasts a per-query message when a request fails, and a feature declares an `owner`:

```sample
tanstack-start/src/docs/query-meta.ts#root
```

A package that ships a link or feature needs only these exports: `link` and `feature`, the types `Link`, `Feature` and `Operation` (the request a link gets) to name them, and `Target` and `QueryInfo` for a [target](./query-invalidation.md#matching-with-where) that matches on the fields it declares. `groups()` and `tag` are built the same way.

`errorToasts` comes before `retry()`, so it sees a request's error only after its retries ran out. `fail()` values are [expected errors](./query-functions.md#expected-errors): a request returns them rather than throws, so they never reach the `catch`.

## Typing meta by its root

A client's **root** is the links and features it's made with, and the root's `meta` is the fields they declare. The plain `queryOptions` takes any `meta`. To check `meta` against a root, bind the builders to it once per app, in a file of their own, and import them from there instead of from `@raf-query/react`:

```sample title="src/raf.ts"
tanstack-start/src/docs/query-meta.bind.tsx#bind
```

Each binder takes the type of the function that makes the client, or of the client. Only the type is read, so `import type` is enough and the factories don't import the client. A binder returns the plain builder, typed for the root: binding costs a few bytes, and an app that doesn't page leaves out `bindInfiniteQueryOptions` and ships none of the paging code.

Factories built with the bound `queryOptions` name no root themselves:

```sample
tanstack-start/src/docs/query-meta.bind.tsx#bound
```

- `meta` takes only the fields the root's parts declare, with their types:

```sample
tanstack-start/src/docs/query-meta.bind.tsx#bound-errors
```

- Verbs such as `invalidateMany` and `setData` take only that root's clients. The bound `useQueryClient` returns a client of the root, so verbs called in components check their factories too. The plain `useQueryClient()` returns a client of any root, which takes any factory.

```sample
tanstack-start/src/docs/query-meta.bind.tsx#use-query-client
```

- `where` targets see the root's `meta`, as the next section shows.

The root is a function, not a client at module level, because a server makes one client per request. It's the same idea as a [tRPC v12](https://github.com/trpc/trpc/tree/v12) client typing its call options from its links.

## Selecting queries by meta

A `where` target picks queries by what their `meta` says. On a client of a typed root, `query.meta` has the root's fields:

```sample
tanstack-start/src/docs/query-meta.ts#selecting-queries-by-meta
```

See [Query invalidation](./query-invalidation.md#matching-with-where) for targets, and tags, which are targets built on `meta`.

## Serialization

`meta` isn't sent with dehydrated state during SSR: it comes from the factory, so it can hold functions, such as [tags](./query-invalidation.md#tags) computed from the data. An entry only hydrated, which nothing has read through its factory yet, has `{}` as its `meta`. Invalidations still reach it: they're checked again when the entry is next read.
