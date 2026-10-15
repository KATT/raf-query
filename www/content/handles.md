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

## Why handles hold no data

Handles hold no data and no functions. Data reaches the browser's cache through the [hydration stream](./ssr-and-hydration.md), so loader data stays tiny and each query is serialized once, however many components read it.

That also keeps the cache the single source of truth. A component reading a handle always sees the entry's current data: after a refetch, an invalidation or a `setData`, every reader updates, which a value frozen into loader data couldn't do.

## Typed by what the loader did

The loader's return value lists exactly which queries a route started, and its types show which ones the route waited for. `useQuery` returns **the data** for an `EnsuredQueryHandle` and **a promise** for a `QueryHandle`:

```sample
tanstack-start/src/docs/handles.tsx#typed-by-what-the-loader-did
```

The two handle types aren't assignable to each other, so type a prop with the one its loader returns:

```sample
tanstack-start/src/docs/handles.handle-props.tsx#handle-props
```

If you switch a query from `prefetch` to `ensure`, TypeScript points at every component that should stop unwrapping a promise.

## Ensured, but missing

An ensured handle promises the data was loaded before the route rendered. If the entry has lost it since — it was garbage-collected while the router kept the loader data, or something called `reset` — `useQuery` suspends until it's refetched instead of returning `undefined`. The type stays honest.

## Where handles come from

- `qc.prefetch(factory, input)` returns a `QueryHandle` synchronously.
- `await qc.ensure(factory, input)` returns an `EnsuredQueryHandle`.
- `useWaterfall(factory, input)` starts a query during render and returns a `QueryHandle`. It's an [escape hatch](./request-waterfalls.md#render-time-inputs-usewaterfall).

You never build handles by hand: the factory's key and input must agree, and the verbs guarantee it.
