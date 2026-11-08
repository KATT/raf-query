---
title: Query invalidation
description: Mark queries stale after a write, refetch the ones on screen, and select queries by factory, group, tag or predicate.
section: Guides
order: 13
---

Waiting for data to go stale on its own doesn't work after a write: the user just changed something and expects to see it. `invalidateOne` and `invalidateMany` mark queries stale and refetch the ones that are being read:

```sample
tanstack-start/src/docs/query-invalidation.ts#intro
```

When a query is invalidated:

- It's marked stale, whatever its `staleTime`. The next `load` that starts it refetches it.
- If something is reading it, it refetches now, in the background. Readers keep showing the current data and re-render when the new data lands.
- If nothing is reading it, nothing happens until the next time something starts or reads it.

The verbs return a promise that resolves once every refetch they started has settled. Await it at the end of an action, and the action stays pending until the fresh data is on screen.

Try it. Each list below reads its own query. Invalidate a group, a factory, or one query, and watch which ones refetch:

```demo
invalidation
```

## Targets

Verbs are functions that take the client first. Each `…One` verb takes a factory and its full input; each `…Many` verb takes a **target**:

| Call                                        | Matches                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `invalidateOne(qc, factory, input)`         | The factory's query for that input                                               |
| `invalidateMany(qc, factory)`               | Every query of the factory                                                       |
| `invalidateMany(qc, factory, partialInput)` | The factory's queries whose input matches `partialInput`                         |
| `invalidateMany(qc, group)`                 | Every key that starts with the [group](./query-keys.md#groups), or a group in it |
| `invalidateMany(qc, tag, param?)`           | Every query with the [tag](#tags), for one parameter or for any                  |
| `invalidateMany(qc, { where }, param?)`     | Every query [`where`](#matching-with-where) returns `true` for                   |
| `invalidateMany(qc, [target, …])`           | Every query any of the targets matches: [several targets](#several-targets)      |
| `invalidateAll(qc)`                         | Everything                                                                       |

A partial input matches the **input** each query's factory was called with, never its key, so it works the same however the key is built: `[postQuery, { slug }]` for a key written as `posts("bySlug", input.slug)`. Object fields match **partially**: `{ status: "done" }` matches any input with that field, whatever else it has.

A query that was only [hydrated](./ssr-and-hydration.md) has no factory until something reads it. A factory target still invalidates it, from its first read. `resetMany` and `removeMany` act at once, so a factory target skips it; a group reaches it by its key.

Targets are values, never strings: a factory matches by identity, a group by its path, and a tag or `where` by what it says about each query. TypeScript checks a partial input against the factory's input, and a tag's parameter against the tag.

> [!NOTE]
> Groups, tags and the way targets match are a design still being settled. See [Query keys](./query-keys.md).

### Several targets

To invalidate more than one thing, pass a list. An element is a group, a factory, a target, or `[factory, partialInput]` / `[target, param]`:

```sample
tanstack-start/src/docs/query-invalidation.ts#several-targets
```

The refetches run side by side, a query that several targets cover refetches once, and the promise resolves when all of them have settled. Awaiting one verb after another serializes them instead: `await invalidateMany(qc, a); await invalidateMany(qc, b);` starts `b`'s refetches only once `a`'s are done. TypeScript checks each element on its own, the way it checks a single target.

### Tags

A tag cuts across groups: every query that shows an author, wherever its key starts. Define one with `tag()` from `@raf-query/react/groups`, and list a query's tags in `meta.tags`, fixed or computed from its data. Tags need the `groups()` feature on the client:

```sample
tanstack-start/src/docs/query-invalidation.ts#tags
```

Called with a parameter, a tag is the string a query lists (`author("ada")`). Passed to a verb, it matches the queries with that tag for one parameter, or for any parameter without one. Tags computed from the data match only queries that have data.

### Matching with where

A target is any object with `where(query, param)`, typed `Target<TMeta, TParam>`. Its `where` gets each query's `queryKey`, `input`, `meta` and `data` (before `select`), and the parameter the verb was called with:

```sample
tanstack-start/src/docs/query-invalidation.ts#matching-with-where
```

`input` is the input of the latest factory call for that entry. An entry that was only hydrated, and not yet read or started on this client, has `undefined` input and `{}` as its `meta`, so match on `queryKey` to include those. On a client of a typed root, `query.meta` has the root's fields: see [Query meta](./query-meta.md#selecting-queries-by-meta).

## Invalidate, reset or remove

| Verbs         | Data                   | Read queries                                 | Use for                                    |
| ------------- | ---------------------- | -------------------------------------------- | ------------------------------------------ |
| `invalidate…` | Kept, shown meanwhile  | Refetch in the background                    | After writes: the normal case              |
| `reset…`      | Dropped                | Suspend and refetch                          | Data that must not be shown again (logout) |
| `remove…`     | Dropped with the entry | Keep what they rendered until they re-render | Freeing memory, dropping an abandoned key  |

Each comes as `…One`, `…Many` and `…All`, with the same targets; `resetMany` and `removeMany` take a list too. `reset` resolves when the refetches it caused settle, like `invalidate`. `remove` is synchronous, and aborts in-flight requests.

## Invalidating from mutations

The common pattern is to invalidate at the end of a write, so it covers whatever the write affected. Await a verb at the end of the action:

```sample
tanstack-start/src/docs/query-invalidation.tsx#invalidating-from-mutations
```

When a write changes more than one thing, invalidate them in [one call](#several-targets), so their refetches run side by side. Prefer invalidating a little too much over too little. Only queries being read refetch, so a broad group costs a request per list on screen, not per list ever loaded.

When the server's response has everything the cache needs, write it with `setData` instead and skip the refetch. See [Mutations](./mutations.md#updates-from-mutation-responses).

## Invalidation on the server

A server render's client never revalidates cached data, because it renders once: `prefetch` and `swr` use what the cache has, even after an invalidation. A `revalidate` refetches an invalidated entry, so it sees the write. This matters in Next.js server actions that render again after a write.
