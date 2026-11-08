---
title: Mutations
description: Write data in React actions inside forms and transitions, keep the UI responsive with useOptimistic, then invalidate or update the cache.
section: Guides
order: 10
---

raf-query has no `useMutation`. React already has the pieces a mutation needs:

- **Actions** ([`<form action>`](https://react.dev/reference/react-dom/components/form), [`startTransition(async () => ...)`](https://react.dev/reference/react/startTransition)) run the write and track its pending state.
- **[`useOptimistic`](https://react.dev/reference/react/useOptimistic)** shows the result before the server confirms it, and rolls back on its own when the action ends.
- **[`useActionState`](https://react.dev/reference/react/useActionState)** keeps the action's result, such as an error message.

The cache's part is what happens after the write: [invalidating](./query-invalidation.md) the queries it affected, or writing the response straight into the cache with `setData`.

## Actions

A mutation is a React action written in the component: get the client with `useQueryClient()`, await the write, then await a verb that invalidates what the write changed:

```sample
tanstack-start/src/docs/mutations.tsx#intro
```

`updatePost` is a plain async function: a `fetch` call, a TanStack Start server function, or a Next.js server action.

The verb resolves once the queries it invalidated that are on screen have refetched. Awaiting it inside the action keeps the action pending until the fresh data is on screen, so the optimistic value is replaced by the real one without flickering back to the old one in between.

The action decides what to invalidate after the write, so it can use the action's arguments and the write's result. Verbs take factories, groups and `where` targets, never raw keys:

| Verb                                          | Marks stale                                         |
| --------------------------------------------- | --------------------------------------------------- |
| `invalidateOne(queryClient, factory, input)`  | One query                                           |
| `invalidateMany(queryClient, factory, part?)` | A factory's queries, optionally only matching input |
| `invalidateMany(queryClient, group)`          | Every query in a group                              |
| `invalidateMany(queryClient, tag, param?)`    | Every query with a tag                              |
| `invalidateMany(queryClient, [target, …])`    | Every query any of the targets matches              |
| `invalidateAll(queryClient)`                  | Every query                                         |

Queries on screen refetch at once, the rest when they're next loaded. See [Query invalidation](./query-invalidation.md).

### Several things at once

When a write changes more than one thing, pass the targets to one `invalidateMany` call:

```sample
tanstack-start/src/docs/mutations.ts#several-targets
```

Their refetches run side by side, and a query that several targets cover refetches once. Awaiting one verb after another serializes them: the second verb's refetches start only once the first's have settled, and the action stays pending for both in a row.

## Optimistic updates

`useOptimistic` holds a value for as long as an action is running. When the action ends, it falls back to the value passed in, which by then is the refetched data. If the action throws, it falls back to the old data: the rollback is automatic.

Add a comment below. The server is slow, and you can make the next request fail to watch the optimistic comment roll back:

```demo
optimistic-updates
```

The demo's form:

```sample
tanstack-start/src/docs/mutations.optimistic-updates.tsx#optimistic-updates
```

### Optimistic updates in the cache

`useOptimistic` covers the component that ran the action. When other parts of the page show the same data (a count in the sidebar, the same item in another list), update the cache instead, so every reader sees it:

```sample
tanstack-start/src/docs/mutations.ts#optimistic-updates-in-the-cache
```

`feedQuery` is [paged](./infinite-queries.md), so its data is `{ pages, pageParams }`: the updater patches the post's title in whichever page holds it and keeps `pageParams` as they are.

This is more code, and you're responsible for the rollback. Reach for it only when `useOptimistic` can't reach the readers that need the update.

## Updates from mutation responses

When the server responds with the updated object, write it into the cache instead of refetching:

```sample
tanstack-start/src/docs/mutations.ts#updates-from-mutation-responses
```

`setData(queryClient, factory, input, updater)` takes a value or an updater, `(previous) => next`, where `previous` is `undefined` when the cache has no data. A factory without an input leaves it out: `setData(queryClient, feedQuery, updater)`. Readers re-render with the new data at once, without suspending. The entry is created if it doesn't exist yet, and data written with `setData` counts as just fetched, so it's fresh for `staleTime`. `getData(queryClient, factory, input)` reads the cached data back.

Keep updaters immutable: return new objects and arrays. Structural sharing compares the new data with the old, so mutating `previous` in place can hide the change from readers.

## Error messages

Wrap the action in `useActionState` and return the caught error, as the demo does. The returned value is the action's state, so the form can render it next to the input. An error thrown out of an action (instead of returned) goes to the nearest error boundary.

## Pending state

Inside a form, [`useFormStatus()`](https://react.dev/reference/react-dom/hooks/useFormStatus) gives a submit button the form's pending state. Outside one, [`useTransition`](https://react.dev/reference/react/useTransition) returns `isPending` for the actions you start with its `startTransition`. Either way, the pending state lasts until the awaited verb's refetches settle:

```sample
tanstack-start/src/docs/mutations.tsx#pending-state
```

## Mutations that navigate

After creating a post, you usually navigate to it. Navigate after the action resolves, and the destination's loader finds the cache already up to date. If the destination's loader starts the new post with `swr`, you can skip invalidating it entirely: a cache miss always fetches.

## Serial mutations

Actions run concurrently by default. When writes must happen in order (each depends on the server's response to the previous one), queue them in your own code, or disable the form while one is pending.
