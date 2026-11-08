---
title: Query functions
description: What a queryFn may return, how errors are reported, and what the query function context contains.
section: Guides
order: 4
---

A query function can be literally any function that **returns a value or a promise**. The promise should either **resolve the data** or **throw**.

Unlike TanStack Query, `undefined` is a valid result: a `queryFn` typed `Promise<User | undefined>` caches `undefined` like any other value. So `getData` and a `setData` updater's `previous` are `undefined` both with no data and with `undefined` data; a reader's `isPending` tells them apart.

All of these are valid:

```sample
tanstack-start/src/docs/query-functions.ts#intro
```

In practice the `queryFn` lives in a [factory](./query-factories.md) and closes over the factory's input, which is easier to type than reading it back from the key.

## Handling and throwing errors

A query function that **throws** or returns a **rejected promise** fails. The error is kept on the query: the first load's error rejects the promise `useQuery` returns, so `use()` throws it to the nearest error boundary, and a later background error shows up in the state's `error` while the old data stays readable.

```sample
tanstack-start/src/docs/query-functions.ts#handling-and-throwing-errors
```

With the `retry()` link, which `recommended()` includes, failed requests are [retried](./retries.md) three times before they count as failed.

## With `fetch` and other clients that don't throw

Many clients, such as axios, throw for unsuccessful HTTP responses. [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch) doesn't, so throw yourself:

```sample
tanstack-start/src/docs/query-functions.ts#with-fetch-and-other-clients-that-dont-throw
```

A not-found can also be a plain value: return `null` and let the page decide, or throw your router's `notFound()` from the `queryFn` so the route renders its not-found component.

## Streaming

A `queryFn` that returns an [async iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#the_async_iterator_and_async_iterable_protocols) is a stream. Pass `stream` to fold its chunks into the data: `initial` is the data before the first chunk, and `reduce` adds a chunk to it.

```sample
tanstack-start/src/docs/query-functions.ts#streaming
```

Readers get the data after the first chunk, and every later chunk updates it in place. The state's `isFetching` stays `true` until the stream ends.

## The query function context

Each `queryFn` receives a context object:

- `queryKey`, the query's [key](./query-keys.md), typed as the factory wrote it
- `signal: AbortSignal`, aborted when the request is cancelled. Pass it to `fetch` so [cancelled requests](./query-cancellation.md) stop using the network.
- `meta`, the query's [`meta`](./links-and-features.md), or `{}` when it has none

[Paged queries](./infinite-queries.md) also get:

- `pageParam`, the page to load
- `direction: "forward" | "backward"`, which end of the list the page is added to

## Redirects

In TanStack Start, a `queryFn` can `throw redirect({ to: "/login" })`. The router integration turns it into a navigation, from a loader or from a background refetch. Pass `handleRedirects: false` to `setupRouterIntegration` to handle them yourself.
