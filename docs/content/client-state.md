---
title: Server state and client state
description: raf-query manages server state, data owned by a backend. What that leaves for URL state, local state and a client store.
section: Guides
order: 22
---

raf-query is a cache for **server state**: data that lives on a server, that other people can change, that you load asynchronously and that goes out of date. It's not a general-purpose state manager.

Once server state lives in the cache, most apps find that what's left is small:

| State                                           | Where it belongs                        |
| ----------------------------------------------- | --------------------------------------- |
| Posts, users, comments, anything from a backend | raf-query                               |
| Filters, sort, pagination, the selected tab     | The URL: search params and the path     |
| An input's text, whether a menu is open         | `useState` in the component             |
| Pending and optimistic state of a write         | `useActionState`, `useOptimistic`       |
| Theme, a draft that survives navigation         | A small client store, or `localStorage` |

The URL deserves special mention. raf-query asks that anything which changes what a query fetches lives in the URL, so the loader can start the query on navigation. That's also what makes a page shareable, bookmarkable and restorable with the back button, which state in a store isn't.

## Copying server data into a store

Avoid copying query data into a client store (or into `useState`). The copy doesn't refetch, doesn't hear about invalidation, and goes stale the moment the cache updates. Read the query wherever the data is needed: requests are deduped, and readers share one cache entry.

The exception is a form: initializing an input from server data is fine. `defaultValue={post.title}` gives the user their own copy to edit, and the write goes through an action.
