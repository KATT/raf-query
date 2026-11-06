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

## Defined handles

`prefetchEntry` doesn't wait, so its handle is a plain `QueryHandle`. `ensureEntry` and `fetchEntry` waited for the data, so their handles are `DefinedQueryHandle`s: the same handle plus `defined: true`, which tells `useQuery` the cache had data when the loader returned.

The data itself is in the second element of what `load` resolves to, for the code that called it. A loader can branch on it or build another query's input from it, and a server component can render it. It's the cache entry's own object (through `select`), not a copy.

## Typed by what the loader did

The loader's return value lists exactly which queries a route started, and its types show which ones the route waited for. `useQuery` returns **the data** for a `DefinedQueryHandle` and **a promise** for a `QueryHandle`:

```sample
tanstack-start/src/docs/handles.tsx#typed-by-what-the-loader-did
```

Type a prop with the handle its loader returns:

```sample
tanstack-start/src/docs/handles.handle-props.tsx#handle-props
```

A handle's type names its factory, and a factory's type includes its key's shape (`readonly ["posts", "bySlug", string]`). So `useQuery(draftQuery, handle)` is a type error when `handle` came from `postQuery`, even when both take the same input and return the same data. Factories whose keys have the same shape read the same entries, so their handles mix.

`DefinedQueryHandle` extends `QueryHandle`, so TypeScript lets a defined handle into a `QueryHandle` prop. `useQuery` picks by the handle it gets at runtime, though: there it returns the data while the prop's type says promise, and `use()` on it throws. If you switch a query from `prefetchEntry` to `ensureEntry`, switch the props that receive its handle to `DefinedQueryHandle`.

## The cache is the source of truth

`load`'s data is what the cache held when it resolved. `useQuery` reads the entry's current data instead: after a refetch, an invalidation or a `setData`, every reader updates, which a value frozen into loader data couldn't do.

If the entry has lost its data since — it was garbage-collected while the router kept the loader data, or something called `resetOne` — `useQuery` suspends until it's refetched instead of returning `undefined`.

## Where handles come from

- `load(qc, entries)` resolves to a handle per entry: a `QueryHandle` for `prefetchEntry`, a `DefinedQueryHandle` for `ensureEntry` and `fetchEntry`.
- `waterfallHandle(factory, input)` returns a `QueryHandle` that starts nothing: the component that reads it fetches while rendering. It's an [escape hatch](./request-waterfalls.md#render-time-inputs-waterfallhandle).

You never build handles by hand: the factory's key and input must agree, and `load` and `waterfallHandle` guarantee it.
