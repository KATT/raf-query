---
title: Query keys
description: How query keys identify cache entries, how groups name sets of queries, and how to include a factory's input in its key.
section: Guides
order: 2
---

At its core, raf-query caches by **query key**. A key is an array at the top level. It can be as simple as one string, or as complex as many strings and nested objects. As long as it serializes with `JSON.stringify` and is **unique to the query's data**, you can use it.

Keys also travel inside [handles](./handles.md), from the server to the browser, so they must be plain data: strings, numbers, booleans, `null`, arrays and plain objects.

> [!NOTE]
> Groups and the way verbs match keys are a design still being settled. The shapes on this page can change before 1.0.

## Groups

Build keys with a **group**. A group names a set of queries, so one call can [invalidate](./query-invalidation.md) them all. `group(name)` comes from `@raf-query/react`, and `group(parent, name)` makes a group inside another:

```sample
tanstack-start/src/docs/query-keys.ts#groups
```

Call a group for a key. The key is a flat, plain array that starts with the group's path, `["posts", "drafts", "list"]`, so it looks the same in memory, on the wire and in [devtools](./devtools.md). Invalidating a group covers every key that starts with its path: `posts` covers `drafts` and every query in it, and `drafts` doesn't cover `posts`.

Verbs take the group itself, never a string or an array, so a typo in a group's name is a type error instead of a target that silently matches nothing.

Two things under one group can't share a name: if `posts("drafts", id)` were a query next to the `drafts` group, invalidating `drafts` would reach it. In development, whichever comes second throws. Production builds leave the check out.

### Hand-written keys

`queryOptions` takes any plain array as a key, so a key doesn't have to come from a group. A group still covers a hand-written key that starts with its path:

```sample
tanstack-start/src/docs/query-keys.ts#hand-written-keys
```

Prefer groups: a hand-written key repeats the group's names by hand, and the development check for shared names only sees keys a group built.

## Simple keys

The simplest key is a group with a constant, or the group alone. It suits:

- generic list or index resources
- non-hierarchical resources

```sample
tanstack-start/src/docs/query-keys.ts#simple-keys
```

## Keys with variables

When a query needs more information to describe its data, pass it to the group after the query's name: an id, an index, or an object of parameters. This suits:

- hierarchical or nested resources, usually identified by an id
- queries with parameters, usually passed as an object

```sample
tanstack-start/src/docs/query-keys.ts#keys-with-variables
```

## Keys are hashed deterministically

Object keys are sorted before hashing, and `undefined` fields are dropped, so all of these name the same entry:

```sample
tanstack-start/src/docs/query-keys.ts#keys-are-hashed-deterministically
```

Array order does matter. These are three different entries:

```sample
tanstack-start/src/docs/query-keys.ts#array-order-matters
```

`useQuery`'s state exposes the hashed key as `hash`, which makes a good `key` prop for a Suspense boundary.

## Put the input in the key

A query's key must change whenever its data would. In raf-query that's natural: a factory's single argument is its **input**, and the key is built from it. Make the input the **last** segment:

```sample
tanstack-start/src/docs/query-keys.ts#put-the-input-in-the-key
```

Each distinct input gets its own entry, cached independently. Because the input comes from the URL (see [URL state and pagination](./url-state-and-pagination.md)), a new search param means a new key, and the loader starts it.

## Design keys for invalidation

A group matches every key that starts with its path. A factory matches the queries it built, and a factory with part of its input matches the queries whose input has those fields. Every level is one call:

```sample
tanstack-start/src/docs/query-keys.ts#design-keys-for-invalidation
```

For sets of queries that cut across groups, such as every query that shows one author, give them [tags](./query-invalidation.md#tags): a `where` target over `meta`, written in your app. See [Query invalidation](./query-invalidation.md) for every target.
