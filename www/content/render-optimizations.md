---
title: Render optimizations
description: Structural sharing, stable promises and select keep the data's identity stable, so memoized components re-render only when their data changed.
section: Guides
order: 19
---

A component that calls `useQuery` re-renders whenever its query's state changes: new data, a request starting or ending. What raf-query keeps stable is the data: its identity changes only when its content does, so `memo` components, [React Compiler](https://react.dev/learn/react-compiler) and effects below the reader skip work on refetches that changed nothing.

## Structural sharing

When a query refetches, the new data is compared with the old. Objects and arrays that are deeply equal keep their old identity:

```ts twoslash
// ---cut---
// Before: { id: 1, author: { name: "Ada" }, tags: ["a"] }
// After:  { id: 1, author: { name: "Ada" }, tags: ["a", "b"] }
// `after.author === before.author`: unchanged parts keep their identity.
```

This lets `memo` components and React Compiler skip re-rendering children whose props didn't change, and keeps effects from re-running on refetches that changed nothing.

When the whole response is deeply equal to the cached data, the old data is kept as it is, and the reader's promise doesn't change.

Structural sharing only looks inside plain objects and arrays. Class instances, `Map`s and `Date`s are compared by identity. Turn it off for very large responses where the comparison costs more than it saves, per query or for the whole client with `createQueryClient({ structuralSharing: false })`:

```sample
tanstack-start/src/docs/render-optimizations.ts#structural-sharing
```

## Stable promises

For a handle from `prefetchEntry`, `useQuery` returns a promise owned by the cache. It changes only when the data does, so it's safe to pass down, compare, or use as a dependency. A new promise is always already resolved: `use()` returns its value synchronously, and nothing suspends on a refetch.

## Selecting data

`select` in a factory derives what readers get from the `queryFn`'s data:

```sample
tanstack-start/src/docs/render-optimizations.ts#selecting-data
```

- `select` runs again only when the cached data changes, so its result keeps its identity across refetches that changed nothing.
- It's part of the factory, so every reader of the factory gets the selected data. `getData` and `setData` work on the data before `select`.
- `select` doesn't stop the reader from re-rendering: the component still re-renders when the query's state changes, but what it passes down stays the same.

For a derivation only one component needs, derive in render. The data only changes when it actually changed, so with React Compiler (or `useMemo`) the derivation reruns only then:

```sample
tanstack-start/src/docs/render-optimizations.tsx#deriving-in-render
```

## Reading where the data is used

Since every reader of a query re-renders on its state changes, pass the handle down instead of the data, and call `useQuery` in the components that use it:

```sample
tanstack-start/src/docs/render-optimizations.tsx#reading-where-the-data-is-used
```

Both components read the same query. When a request starts and ends, they re-render; the page around them doesn't. Handles are small serializable objects that don't change while the page shows the same query, so passing them down costs nothing.

## Passing promises down

A parent can read a prefetched handle and hand the promise to a child, so only the child suspends. The promise changes only when the data does, which is exactly when the child needs new props:

```sample
tanstack-start/src/docs/render-optimizations.passing-promises-down.tsx#passing-promises-down
```
