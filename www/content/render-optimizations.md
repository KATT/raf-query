---
title: Render optimizations
description: Structural sharing, stable promises and tracked controls keep re-renders to the components whose data actually changed.
section: Guides
order: 19
---

raf-query re-renders a component only when something it uses has changed. Three mechanisms make that happen, all on by default, and [`select`](#selecting-part-of-the-data) narrows a read to the part of the data a component uses.

## Structural sharing

When a query refetches, the new data is compared with the old. Objects and arrays that are deeply equal keep their old identity:

```ts twoslash
// ---cut---
// Before: { id: 1, author: { name: "Ada" }, tags: ["a"] }
// After:  { id: 1, author: { name: "Ada" }, tags: ["a", "b"] }
// `after.author === before.author`: unchanged parts keep their identity.
```

This lets `memo` components and React Compiler skip re-rendering children whose props didn't change, and keeps effects from re-running on refetches that changed nothing.

When the whole response is deeply equal to the cached data, the old data is kept as it is, and the reader's promise doesn't change: nothing re-renders at all.

Structural sharing only looks inside plain objects and arrays. Class instances, `Map`s and `Date`s are compared by identity. Turn it off for very large responses where the comparison costs more than it saves:

```sample
tanstack-start/src/docs/render-optimizations.ts#structural-sharing
```

## Stable promises

`useQuery` returns a promise owned by the cache. It changes only when the data does, so it's safe to pass down, compare, or use as a dependency. A new promise is always pre-resolved: `use()` returns its value synchronously, and nothing suspends on a refetch.

## Tracked controls

The controls object returned by `useQuery` tracks which fields a component reads. Reading `controls.isFetching` subscribes the component to `isFetching`; a component that never reads it isn't re-rendered when a background refetch starts and ends.

```sample
tanstack-start/src/docs/render-optimizations.tsx#tracked-controls
```

Both components read the same query; each pays only for what it reads. Destructure only what you use. Spreading the controls (`{ ...controls }`) reads every field and subscribes to all of them.

## Passing promises down

A parent can read a prefetched handle and hand the promise to a child, so only the child suspends. The parent re-renders when the promise changes, which is exactly when the child needs new props:

```sample
tanstack-start/src/docs/render-optimizations.passing-promises-down.tsx#passing-promises-down
```

## Selecting part of the data

`select` reads part of a query's data. The promise settles with what it returns, and the component re-renders only when that value changes:

```sample
tanstack-start/src/docs/render-optimizations.tsx#select
```

- **It runs again when the data or the function changes.** An inline function that reads props is fine: it reruns each render, and an equal result keeps the same promise.
- **Its result is structurally shared** with the last one. A refetch that renames a todo but leaves the count alone keeps the promise, so `DoneCount` doesn't re-render.
- **It only reads.** The cache keeps the query's full data, and every other reader of the query sees it unchanged.
- **The rest of the read stays the same.** A handle from `ensure` or `fetch` returns the selected value itself. With `whilePending: "previous"`, it selects from the previous input's data. With `throwOnError: false`, the `Result` holds the selected value, and failures pass through. Paged factories get `{ pages, pageParams }` and keep their paging controls.
- **If it throws**, the promise rejects with the error, as a failed first load does.

## Deriving data

When a component uses the whole data anyway, derive in render. The data only changes when it actually changed, so with React Compiler (or `useMemo`) the derivation reruns only then:

```sample
tanstack-start/src/docs/render-optimizations.tsx#deriving-data
```

To share a derivation, put it in a function next to the factory, and pass it as `select` or call it wherever the data is read.
