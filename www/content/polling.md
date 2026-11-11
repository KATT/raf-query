---
title: Polling
description: Refetch a query on an interval while it's on screen with refetchInterval and the polling() part.
section: Guides
order: 15
---

A query with a `refetchInterval` refetches every so many milliseconds while a component reads it:

```sample
tanstack-start/src/docs/polling.ts#intro
```

`polling()` is the [part](./links-and-features.md#parts) that reads the option, so the client needs it, on its own or through `recommended()`:

```sample
tanstack-start/src/docs/polling.ts#the-feature
```

`polling()` declares the option, so it's set with the `queryOptions` an app [binds to its client](./links-and-features.md#typing-options-by-the-client), here in `raf.ts`. The `queryOptions` that `@raf-query/react` exports doesn't take it, and neither does one bound to a client without `polling()`.

- Polling starts when the first component reads the query, and stops when the last one unmounts.
- There is one timer per query, however many components read it.
- A poll that lands while another request for the query is in flight joins it instead of starting a second one.
- `polling()` is a feature: it runs while a `QueryClientProvider` has the client mounted, so the server never polls.

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
