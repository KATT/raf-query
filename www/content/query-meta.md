---
title: Query meta
description: Attach information to queries with meta, read it in the queryFn, error handlers and devtools, and type it for the whole app.
section: Guides
order: 20
---

`meta` attaches anything you want to know about a query elsewhere. It reaches:

- the `queryFn`, as `context.meta`
- `Query.metaUnsafe(query)`, from the latest factory call for the entry, wherever you get a `Query` (`onError`, filters, `getAll()`)
- the devtools, in the entry's details

A common use is a per-query message for one global error handler:

<<< ./query-meta/src/error-toast.ts#setup

## Typing meta

`meta` is `Record<string, unknown>` by default. Type it for the whole app by augmenting `Register` in the package you import from (`@raf-query/react` re-exports it from `@raf-query/core`, so either works):

<<< ./query-meta/src/register.ts#register

Every `meta` is then checked against that type, and `Query.metaUnsafe` returns it.

## Defaults

`config.defaults` takes `meta` too, for queries that set none. A query's own `meta` replaces the default as a whole; the two aren't merged.

<<< ./query-meta/src/defaults.ts#defaults

## Selecting queries by meta

Filters receive the `Query`, so `meta` can select queries to invalidate:

<<< ./query-meta/src/invalidate-billing.ts#invalidate

## Serialization

`meta` is sent with dehydrated state during SSR, so keep it serializable. A hydrated entry reports the server's `meta` until the browser calls its factory.
