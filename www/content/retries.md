---
title: Retries and errors
description: Retry failed requests with the retry() link, set attempts per query in meta, choose delays and which errors to retry, time requests out, and show errors.
section: Guides
order: 14
---

The `retry()` link retries failed requests. With its defaults, a request that fails in the browser is retried **3 times**, waiting 1, 2 and then 4 seconds, before the query counts as failed. Readers keep suspending, or keep showing their current data, the whole time.

Nothing retries unless the client has the link, on its own or through `recommended()`:

```sample
tanstack-start/src/docs/retries.ts#intro
```

Some requests are never retried:

- **Expected errors.** A `queryFn` that returns `fail(...)` has answered: the error is the result. See [Query functions](./query-functions.md#expected-errors).
- **Cancelled requests**, whose `signal` was aborted.
- **Requests on a server client.** The user is waiting for the HTML, and the browser can try again.

## Attempts per query

A query sets its own attempts with `meta: { retry }`: a number of retries after the first attempt, or `false` for none. It wins over the link's `attempts`:

```sample
tanstack-start/src/docs/retries.ts#attempts-per-query
```

The `retry()` link declares the field, so a factory built with a bound `queryOptions` gets it typed only when the root has the link: see [Query meta](./query-meta.md#typing-meta-by-its-root). On a client without the link, `meta.retry` does nothing.

## Options

`retry({ attempts, delay, when })` sets the defaults for every query of the client:

| Option     | Default                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `attempts` | `3`: retries after the first attempt                                                                                                 |
| `delay`    | Doubling from 1 second, at most 30 seconds                                                                                           |
| `when`     | Every error but a thrown [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response): whether an error is worth retrying |

`delay(attempt)` gets the retry's index, from `0`. `when(error)` is the place to skip errors that won't go away:

```sample
tanstack-start/src/docs/retries.ts#options
```

### Retries while offline

In the browser, a retry waits while [`navigator.onLine`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine) is `false`: after the delay, it waits for the window's [`online`](https://developer.mozilla.org/en-US/docs/Web/API/Window/online_event) event. The query counts as fetching meanwhile. The first attempt always runs.

## Timeouts

`timeout(ms)` is another link: it fails a request that takes longer than `ms` with a `QueryTimeoutError`, and aborts its `signal`. Links wrap each other in order, outermost first, so where it goes decides what it times:

```sample
tanstack-start/src/docs/retries.ts#timeouts
```

## Showing errors

What the user sees depends on whether there was data before the failure.

**The first load fails.** Reading the query throws to the nearest error boundary. Before the boundary renders its children again, start the query again the way the loader did, so the reader suspends on the new request instead of throwing the old error:

```sample
tanstack-start/src/docs/retries.tsx#showing-errors
```

Any error boundary works: [`CatchBoundary`](https://tanstack.com/router/latest/docs/framework/react/api/router/catchBoundaryComponent) from TanStack Router, [`react-error-boundary`](https://github.com/bvaughn/react-error-boundary), Next.js's [`error.tsx`](https://nextjs.org/docs/app/api-reference/file-conventions/error), or your own class component. For expected errors, `QueryBoundary` from `@raf-query/boundary` picks a handler by the error's `_tag` and retries for you.

**A background refetch fails.** The existing data stays on screen: losing it because a refetch failed would be worse than showing it a little longer. The error is on the reader's controls as `error`, for a hint:

```sample
tanstack-start/src/docs/retries.stale-data-notice.tsx#stale-data-notice
```

Make the next request fail in the demo, then reload a post to see each case:

```demo
retries
```

## Errors from loaders

A failed `prefetch` never makes `load` reject: the error surfaces where the data is read, and only that part of the page shows it. A failed `swr` or `revalidate` makes `load` reject, so it reaches the route's error boundary (`errorComponent` in TanStack Router, `error.tsx` in Next.js), replacing the page.

This is one more reason to choose per query: wait with `swr` for what the page can't do without, and `prefetch` the rest, so a failing sidebar doesn't take the whole page down.

## One place for every error

A link sees every request of the client, so it's the place for logging and toasts. Put it before `retry()` to see each request's final error, after its retries. It can declare a `meta` field of its own, for a per-query message:

```sample
tanstack-start/src/docs/retries.ts#one-place-for-every-error
```

## Redirects

In TanStack Start, a `queryFn` can throw the router's [`redirect()`](https://tanstack.com/router/latest/docs/framework/react/api/router/redirectFunction), for instance when a session has expired. `setupRouterIntegration` turns it into a navigation wherever the query failed: a loader, a render or a background refetch.

A redirect is a thrown `Response`, which `retry()` doesn't retry, so it navigates at once. A `when` of your own replaces that check, so keep it:

```sample
tanstack-start/src/docs/retries.ts#redirects
```
