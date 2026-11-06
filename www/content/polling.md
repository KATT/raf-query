---
title: Polling
description: Refetch a query on an interval while it's on screen with meta.refetchInterval and the polling() feature.
section: Guides
order: 16
---

A query with `meta: { refetchInterval }` refetches every so many milliseconds while a component reads it:

```sample
tanstack-start/src/docs/polling.ts#intro
```

The `polling()` feature reads that field, so the client needs it, on its own or through `recommended()`:

```sample
tanstack-start/src/docs/polling.ts#the-feature
```

On a client without `polling()`, `refetchInterval` does nothing. A factory that names its root with `def` gets the field typed only when the root has the feature: see [Query meta](./query-meta.md#typing-meta-by-its-root).

- Polling starts when the first component reads the query, and stops when the last one unmounts.
- There is one timer per query, however many components read it.
- A poll that lands while another request for the query is in flight joins it instead of starting a second one.
- Features run while a `QueryClientProvider` has the client mounted, so the server never polls.

Each poll is a background refetch: the data on screen stays put. Structural sharing keeps a response equal to the current data from changing the data's identity, so memoized children don't re-render.

```demo
polling
```

## The interval per input

The interval is part of the query's options, so a factory can compute it from its input:

```sample
tanstack-start/src/docs/polling.ts#the-interval-per-input
```

`false` or `0` turns polling off. Each input is its own query, so this picks the interval per query; it can't change while the same query is read.

## Polling and staleTime

Polling refetches whatever the data's `staleTime`: the interval is an explicit request for fresh data. Keep `staleTime` meaningful anyway, because the loaders that start the same query rely on it.
