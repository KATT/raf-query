---
title: Query keys
description: How query keys identify cache entries, how groups name sets of queries, and how to include a factory's input in its key.
section: Guides
order: 2
---

At its core, raf-query caches by **query key**. A key is an array at the top level. It can be as simple as one string, or as complex as many strings and nested objects. As long as it serializes with `JSON.stringify` and is **unique to the query's data**, you can use it.

Keys also travel inside [handles](./handles.md), from the server to the browser, so they must be plain data: strings, numbers, booleans, `null`, arrays and plain objects.

> [!NOTE]
> Groups, tags and the way verbs match keys are a design still being settled. The shapes on this page can change before 1.0.

## Simple keys

The simplest key is an array of constants. It suits:

- generic list or index resources
- non-hierarchical resources

```sample
tanstack-start/src/docs/query-keys.ts#simple-keys
```

## Groups

A **group** names a set of queries, so one call can [invalidate](./query-invalidation.md) them all. `group()` comes from `@raf-query/react/groups`, and takes an optional parent group:

```sample
tanstack-start/src/docs/query-keys.ts#groups
```

Put the group first in the key. A group is frozen plain data, `{ group: "todos/archived" }`, so a key with one looks the same in memory, on the wire and in [devtools](./devtools.md). Invalidating a group covers every key whose first segment is that group or a group inside it: `todos` covers `archived`, and `archived` doesn't cover `todos`.

Verbs take the group itself, never a string or a hand-written `{ group }` object, so a typo in a group's name can't silently match nothing.

## Keys with variables

When a query needs more information to describe its data, add it to the array after the group: an id, an index, or an object of parameters. This suits:

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

`useQuery`'s controls expose the hashed key as `hash`, which makes a good `key` prop for a Suspense boundary.

## Put the input in the key

A query's key must change whenever its data would. In raf-query that's natural: a factory's single argument is its **input**, and the key is built from it. Make the input the **last** segment:

```sample
tanstack-start/src/docs/query-keys.ts#put-the-input-in-the-key
```

Each distinct input gets its own entry, cached independently. Because the input comes from the URL (see [URL state and pagination](./url-state-and-pagination.md)), a new search param means a new key, and the loader starts it.

## Design keys for invalidation

Verbs match queries by what they are, not by key prefix: a group, a factory, or a factory and part of its input, which is matched against the key's last segment. With groups first and the input last, every level is one call:

```sample
tanstack-start/src/docs/query-keys.ts#design-keys-for-invalidation
```

For sets of queries that cut across groups, such as every query that shows one author, give them [tags](./query-invalidation.md#tags). See [Query invalidation](./query-invalidation.md) for every target.
