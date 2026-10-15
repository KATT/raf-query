---
title: Handles
description: The small, serializable object that carries a query from the loader or server to the component that reads it.
section: Guides
order: 6
---

A handle is the only thing that crosses the loader → component or server → client boundary:

```sample
tanstack-start/src/docs/handles.ts#intro
```

## Handles with data

`prefetch` doesn't wait, so its handle is the query's key and input. `ensure` and `fetch` waited for the data, so they return a `QueryHandleWithData`: the same handle plus `data`, for the code that called them. A loader can branch on it or build another query's input from it, and a server component can render it.

`QueryHandleWithData` extends `QueryHandle`, so it goes anywhere a handle does. Type a prop with `QueryHandle` and it takes a handle from any verb:

```sample
tanstack-start/src/docs/handles.handle-props.tsx#handle-props
```

`data` is the cache entry's own object, not a copy. Data reaches the browser's cache through the [hydration stream](./ssr-and-hydration.md), and the TanStack Router serializer and React's RSC payload both send an object once, however many handles and entries point at it.

## The cache is the source of truth

`data` is what the cache held when the verb resolved. Components read the query with `useQuery`, which reads the entry's current data: after a refetch, an invalidation or a `setData`, every reader updates, which a value frozen into loader data couldn't do.

`useQuery` returns a promise for every handle. For a handle from `ensure` or `fetch` it is already fulfilled, so `use()` returns without suspending:

```sample
tanstack-start/src/docs/handles.tsx#reading
```

If the entry has lost its data since — it was garbage-collected while the router kept the loader data, or something called `reset` — the promise is pending again and `use()` suspends until it's refetched.

## Where handles come from

- `qc.prefetch(factory, input)` returns a `QueryHandle` synchronously.
- `await qc.ensure(factory, input)` and `await qc.fetch(factory, input)` return a `QueryHandleWithData`.
- `useWaterfall(factory, input)` starts a query during render and returns a `QueryHandle`. It's an [escape hatch](./request-waterfalls.md#render-time-inputs-usewaterfall).

You never build handles by hand: the factory's key and input must agree, and the verbs guarantee it.
