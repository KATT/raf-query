---
title: Important defaults
description: When raf-query fetches, refetches, retries and garbage-collects, which behaviors are on by default, and which options change it.
section: Guides
order: 1
---

A client from `createQueryClient()` caches, dedupes and garbage-collects, and nothing else. Retries, refetching on focus and reconnect, and polling are **links** and **features** you pass to the client. `recommended()` returns the set most apps want:

```ts twoslash
import { createQueryClient, recommended } from "@raf-query/react";
// ---cut---
export function makeQueryClient() {
	return createQueryClient({ ...recommended(), staleTime: 30_000 });
}
```

| Part                 | Kind    | What it does                                                     |
| -------------------- | ------- | ---------------------------------------------------------------- |
| `retry()`            | link    | Retries failed requests. See [Retries](./retries.md)             |
| `focusRefetch()`     | feature | Refetches read, stale queries when the window regains focus      |
| `reconnectRefetch()` | feature | Refetches read, stale queries when the browser comes back online |
| `polling()`          | feature | Refetches read queries on a timer set by `meta.refetchInterval`  |

Pass `links` and `features` yourself to pick some of them, or to add your own. [Query meta](./query-meta.md) covers how they're configured per query.

Keep these in mind as you read the rest of the guides. Retries, focus and reconnect refetching, and polling assume `recommended()`:

- **Reading a query never refetches stale data.** `useQuery` reads what's in the cache: a component that mounts with stale data renders it and starts no request, unlike TanStack Query's `useQuery`, which refetches stale data on mount. Loaders decide freshness: every [load entry](./starting-queries.md) refetches stale data when a loader starts it (`prefetch` and `swr` in the background, `revalidate` before it resolves). Stale data refreshes:
  - when the next loader or server component starts the query with `load`, which TanStack Router does on every navigation
  - when the query is [invalidated](./query-invalidation.md), such as at the end of an action that [writes data](./mutations.md)
  - on [window focus](./window-focus-refetching.md) and on reconnect, for queries being read, with `focusRefetch()` and `reconnectRefetch()`
  - on a timer, with `polling()` and `meta.refetchInterval` ([Polling](./polling.md))

  Rendering the same handle in ten components reads one cache entry.

- **Cached data is stale immediately** (`staleTime: 0`).

  > [!TIP]
  > Set `staleTime` per query in its factory, or for the whole client in `createQueryClient`. A longer `staleTime` means fewer refetches. `Infinity` never refetches on its own: only [invalidation](./query-invalidation.md) does.

- **Polling is per query.** `meta: { refetchInterval }` refetches on a timer while a component reads the query, independent of `staleTime`. See [Polling](./polling.md).

- **Unread entries are kept for five minutes** (`gcTime: 300_000`). An entry nobody reads is **inactive**: it stays in the cache in case it's needed again, then is garbage-collected.

- **Failed requests retry three times**, with a delay that doubles from one second, up to 30 seconds, before the error reaches the UI. Retries wait while the browser is offline. Thrown `Response`s aren't retried.

- **Data is structurally shared.** When a refetch returns data that's deeply equal to what's cached, the cache keeps the old objects, so unchanged parts keep their identity and nothing re-renders. See [Render optimizations](./render-optimizations.md).

## On the server

A server client (one per request) renders once, so it behaves differently:

- **Cached data is reused**, whatever `staleTime` says: what the request fetched is fresh for that request, and a refetch could only repeat a request whose result is never shown. `revalidate` entries refetch invalidated data, so they see a write made earlier in the request.
- **No retries**, even with `retry()`, and **no garbage collection**: the cache lives as long as the request.
- **No features run.** A provider starts them when it mounts, which only happens in the browser.
- `useIsFetching()` returns `0`, so loading indicators never appear in server HTML.

See [SSR and hydration](./ssr-and-hydration.md#server-clients).

## Changing the defaults

`staleTime`, `gcTime` and `structuralSharing` can be set for the whole client, or per query in its factory. A query's own option wins:

```ts twoslash
import { createQueryClient, retry } from "@raf-query/react";
// ---cut---
const queryClient = createQueryClient({
	links: [retry({ attempts: 1 })],
	staleTime: 30_000,
	gcTime: 10 * 60_000,
});
```

| Option                             | Where                            | Default                                                                       |
| ---------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `staleTime`                        | Client or query                  | `0` ms                                                                        |
| `gcTime`                           | Client or query                  | 5 minutes; never on the server                                                |
| `structuralSharing`                | Client or query                  | `true`                                                                        |
| `retry({ attempts, delay, when })` | Client link                      | 3 attempts, doubling from 1 s up to 30 s, every error but a thrown `Response` |
| `meta.retry`                       | Query, with `retry()`            | The link's `attempts`; `false` turns retries off                              |
| `meta.refetchInterval`             | Query, with `polling()`          | None                                                                          |
| `meta.refetchOnWindowFocus`        | Query, with `focusRefetch()`     | `true`                                                                        |
| `meta.refetchOnReconnect`          | Query, with `reconnectRefetch()` | `true`                                                                        |

Watch the defaults at work in [Caching](./caching.md), which has a live demo of an entry going from fresh to stale to garbage-collected.
