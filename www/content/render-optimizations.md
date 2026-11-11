---
title: Render optimizations
description: Tracked state, structural sharing, stable thenables and select keep readers from re-rendering, and the data's identity stable, when nothing they use changed.
section: Guides
order: 19
---

A component that calls `useQuery` or `useInfiniteQuery` re-renders only when something it uses changed: its thenable, or a state field it read. The data keeps its identity until its content changes, so `memo` components, [React Compiler](https://react.dev/learn/react-compiler) and effects below the reader skip work on refetches that changed nothing.

## Tracked state

The hooks track which state fields a component reads while it renders. A write re-renders the component only when the thenable changed, the thenable settled, or a field it read changed:

- A component that reads only the thenable doesn't re-render while a background refetch starts and ends, or when `isStale` or `updatedAt` change.
- One that reads `isFetching` re-renders when a request starts and when it ends.
- The state object keeps its identity until a field the component read changes. Its functions (`refetch()`, `fetchNextPage()`, `fetchPreviousPage()`) keep theirs for as long as the component is mounted, so they're safe as effect dependencies and `memo` props.
- A field read for the first time in a later render is current, and tracked from then on.

Read fields while rendering. A field read only in an effect or an event handler isn't tracked: it holds its value from the last render, which may be older than the cache.

## Structural sharing

When a query refetches, the new data is compared with the old. Objects and arrays that are deeply equal keep their old identity:

```ts twoslash
// ---cut---
// Before: { id: 1, author: { name: "Ada" }, tags: ["a"] }
// After:  { id: 1, author: { name: "Ada" }, tags: ["a", "b"] }
// `after.author === before.author`: unchanged parts keep their identity.
```

This lets `memo` components and React Compiler skip re-rendering children whose props didn't change, and keeps effects from re-running on refetches that changed nothing.

When the whole response is deeply equal to the cached data, the old data is kept as it is, and the reader's thenable doesn't change.

Structural sharing only looks inside plain objects and arrays. Class instances, `Map`s and `Date`s are compared by identity. Turn it off for very large responses where the comparison costs more than it saves, per query or for the whole client with `createQueryClient({ defaults: { structuralSharing: false } })`:

```sample
tanstack-start/src/docs/render-optimizations.ts#structural-sharing
```

## Stable thenables

`useQuery` returns a thenable owned by the cache. It changes only when the data does, so it's safe to pass down, compare, or use as a dependency. A new thenable is always already fulfilled: `use()` returns its value synchronously, and nothing suspends on a refetch.

## Selecting data

`select` in a factory derives what readers get from the `queryFn`'s data:

```sample
tanstack-start/src/docs/render-optimizations.ts#selecting-data
```

- `select` runs again only when the cached data changes, so its result keeps its identity across refetches that changed nothing.
- It's part of the factory, so every reader of the factory gets the selected data. `getData` and `setData` work on the data before `select`.
- When `select`'s result is unchanged, the reader's thenable is the same, so a component that reads only the thenable doesn't re-render.

For a derivation only one component needs, derive in render. The data only changes when it actually changed, so with React Compiler (or `useMemo`) the derivation reruns only then:

```sample
tanstack-start/src/docs/render-optimizations.tsx#deriving-in-render
```

## Reading where the data is used

Pass the handle down instead of the data, and call `useQuery` in the components that use it. Each reader re-renders only for what it reads:

```sample
tanstack-start/src/docs/render-optimizations.tsx#reading-where-the-data-is-used
```

Both components read the same query. When a request starts and ends, `RefreshButton` re-renders because it reads `isFetching`; `PostBody` reads only the thenable and re-renders when the data changes; the page around them doesn't. Handles are small serializable objects that don't change while the page shows the same query, so passing them down costs nothing.

## Passing thenables down

A parent can read a prefetched handle and hand the thenable to a child, so only the child suspends. The thenable changes only when the data does, which is exactly when the child needs new props:

```sample
tanstack-start/src/docs/render-optimizations.passing-thenables-down.tsx#passing-thenables-down
```
