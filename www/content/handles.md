---
title: Handles
description: The small, serializable object that carries a query from the loader or server to the component that reads it.
section: Guides
order: 6
---

A handle is the only thing that crosses the loader → component or server → client boundary. It's a query's key and its factory's input, and nothing else:

```sample
tanstack-start/src/docs/handles.ts#intro
```

A handle carries no data, so it serializes for free: the TanStack Router serializer, React Router's loader data and React's RSC payload all send it as is. The data reaches the browser's cache through [hydration](./ssr-and-hydration.md), once, however many handles point at it.

## The data the loader waited for

Every entry gives the same `QueryHandle`, whether the loader waited for it or not. The data itself is in the second element of what `load` resolves to, for the code that called it. A loader can branch on it or build another query's input from it, and a server component can render it. It's the cache entry's own object (through `select`), not a copy.

## Reading a handle

`useQuery` takes the factory as well as the handle because the handle is plain data, `{ queryKey, input }`, so it can cross from a loader or a server component to the browser, and a function can't: the handle can't carry the `queryFn`, so you pass the factory alongside it.

`useQuery` returns a thenable for every handle, and `use()` reads it. What the loader did decides whether that read suspends: an `swr` or `revalidate` handle's thenable is already fulfilled, so `use()` returns the data at once, and a `prefetch` handle's suspends until the data lands:

```sample
tanstack-start/src/docs/handles.tsx#reading-a-handle
```

So a prop takes a `QueryHandle` whichever entry fed it, and switching a loader from `prefetch` to `swr` changes nothing in the components.

A handle's type names its factory, and a factory's type includes its key's shape (`readonly ["posts", "bySlug", string]`). So `useQuery(draftQuery, handle)` is a type error when `handle` came from `postQuery`, even when both take the same input and return the same data. Factories whose keys have the same shape read the same entries, so their handles mix.

## The cache is the source of truth

`load`'s data is what the cache held when it resolved. `useQuery` reads the entry's current data instead: after a refetch, an invalidation or a `setData`, every reader updates, which a value frozen into loader data couldn't do.

A loader can't promise the data is still there when a component renders. If the entry has lost it since (it was garbage-collected while the router kept the loader data, or something called `resetOne` or `removeOne`), `use()` on the thenable suspends until the query is refetched instead of returning `undefined`. That's why `useQuery` returns a thenable even for a handle the loader waited for.

## Where handles come from

- `load(qc, entries)` resolves to a `QueryHandle` per entry.
- `waterfallHandle(factory, input)` returns a `QueryHandle` that starts nothing: the component that reads it fetches while rendering. It's an [escape hatch](./request-waterfalls.md#render-time-inputs-waterfallhandle).

You never build handles by hand: the factory's key and input must agree, and `load` and `waterfallHandle` guarantee it.
