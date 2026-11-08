---
title: Query cancellation
description: Pass the queryFn's AbortSignal to fetch so requests nobody needs any more are aborted, and know when raf-query aborts them.
section: Guides
order: 18
---

Every `queryFn` receives an [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) as `signal`. Pass it to [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch) (or any API that takes a signal), and raf-query can abort the request when its result is no longer needed:

```sample
tanstack-start/src/docs/query-cancellation.ts#intro
```

A `queryFn` that ignores the signal still works. Its request just runs to the end, and if raf-query no longer wants it, the result is dropped.

## When requests are aborted

raf-query aborts a request only when it replaces or drops it:

- **A query on screen is invalidated, or any query is reset, while a request is in flight.** That request may have read data from before the write, so it's aborted and a new one starts. Whoever was waiting for the old request gets the new one's result.
- **The query is removed** (`removeOne`, `removeMany`, `removeAll`). Its request is aborted, and a `load` waiting for it rejects with an `AbortError`, as an aborted `fetch` would.
- **A `timeout(ms)` link** gives up on it. See [Retries and errors](./retries.md#timeouts).

Nothing else aborts a request. When the last component reading a query unmounts, its request runs to the end and the result is cached: the query is likely to be read again, and `gcTime` only removes an entry once its request has finished. Requests nothing has read yet, like a loader's `prefetch`, run to the end too.

Try it below. The inbox's `queryFn` passes its signal to the server, so aborted requests show up in the Queries panel:

```demo
cancellation
```

## Cancelling yourself

To stop a request yourself, remove the query with `removeOne(queryClient, factory, input)`: the request is aborted and the data dropped. There's no call that aborts a request and keeps the query; in practice, letting a request finish and caching its result is almost always what you want.

## Using axios or other clients

Clients that accept a signal work the same way, such as [axios](https://axios-http.com/docs/cancellation):

```sample
tanstack-start/src/docs/query-cancellation.ts#using-axios-or-other-clients
```

For clients that take a cancel function instead, call it from an `abort` listener:

```sample
tanstack-start/src/docs/query-cancellation.ts#abort-listener
```
