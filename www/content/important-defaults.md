---
title: Important defaults
description: When raf-query fetches, refetches, retries and garbage-collects, which behaviors are on by default, and which options change it.
section: Guides
order: 1
---

A client from `createQueryClient()` caches, dedupes and garbage-collects, and nothing else. Retries, refetching on focus and reconnect, polling and invalidating after actions are **links** and **features** you pass to the client. `recommended()` returns the set most apps want:

```ts twoslash
import { createQueryClient, recommended } from "@raf-query/react";
// ---cut---
export function makeQueryClient() {
	return createQueryClient({ ...recommended(), staleTime: 30_000 });
}
```

| Part                   | Kind    | What it does                                                                      |
| ---------------------- | ------- | --------------------------------------------------------------------------------- |
| `retry()`              | link    | Retries failed requests. See [Retries](./retries.md)                              |
| `focusRefetch()`       | feature | Refetches read, stale queries when the window regains focus                       |
| `reconnectRefetch()`   | feature | Refetches read, stale queries when the browser comes back online                  |
| `polling()`            | feature | Refetches read queries on a timer set by `meta.refetchInterval`                   |
| `invalidateOnAction()` | feature | Lets [`action()`](./query-invalidation.md#invalidating-from-mutations) invalidate |

Pass `links` and `features` yourself to pick some of them, or to add your own. [Query meta](./query-meta.md) covers how they're configured per query.

With `recommended()`, keep these in mind as you read the rest of the guides:

- **Cached data is stale immediately** (`staleTime: 0`).

  > [!TIP]
  > Set `staleTime` per query in its factory, or for the whole client in `createQueryClient`. A longer `staleTime` means fewer refetches. `Infinity` never refetches on its own: only [invalidation](./query-invalidation.md) does.

- **Stale data refetches in the background** when:
  - a loader or server component starts the query again with `load`, which TanStack Router does on every navigation
  - the window becomes visible again ([window focus refetching](./window-focus-refetching.md)), for queries being read
  - the browser comes back online, for queries being read
  - the query is [invalidated](./query-invalidation.md), including by an `action()`

- **Mounting a component never fetches.** Unlike TanStack Query, raf-query has no refetch on mount: whatever started the query decides when it loads. Rendering the same handle in ten components reads one cache entry.

- **Polling is per query.** `meta: { refetchInterval }` refetches on a timer while a component reads the query, independent of `staleTime`. See [Polling](./polling.md).

- **Unread entries are kept for five minutes** (`gcTime: 300_000`). An entry nobody reads is **inactive**: it stays in the cache in case it's needed again, then is garbage-collected.

- **Failed requests retry three times**, with a delay that doubles from one second, up to 30 seconds, before the error reaches the UI. Retries wait while the browser is offline. Expected errors (`fail()`) and thrown `Response`s aren't retried.

- **Data is structurally shared.** When a refetch returns data that's deeply equal to what's cached, the cache keeps the old objects, so unchanged parts keep their identity and nothing re-renders. See [Render optimizations](./render-optimizations.md).

## On the server

A server client (one per request) renders once, so it behaves differently:

- **Cached data is reused**, whatever `staleTime` says: what the request fetched is fresh for that request, and a refetch could only repeat a request whose result is never shown. Fetch entries refetch invalidated data, so they see a write made earlier in the request.
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

| Option                             | Where                            | Default                                                                                                                                     |
| ---------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `staleTime`                        | Client or query                  | `0` ms                                                                                                                                      |
| `gcTime`                           | Client or query                  | 5 minutes; never on the server                                                                                                              |
| `structuralSharing`                | Client or query                  | `true`                                                                                                                                      |
| `enabled`                          | Query                            | `true`; `false` [disables it](./query-factories.md#disabling-a-query), such as [on the server](./ssr-and-hydration.md#browser-only-queries) |
| `retry({ attempts, delay, when })` | Client link                      | 3 attempts, doubling from 1 s up to 30 s, every error but a thrown `Response`                                                               |
| `meta.retry`                       | Query, with `retry()`            | The link's `attempts`; `false` turns retries off                                                                                            |
| `meta.refetchInterval`             | Query, with `polling()`          | None                                                                                                                                        |
| `meta.refetchOnWindowFocus`        | Query, with `focusRefetch()`     | `true`                                                                                                                                      |
| `meta.refetchOnReconnect`          | Query, with `reconnectRefetch()` | `true`                                                                                                                                      |
| `invalidateOnAction({ default })`  | Client feature                   | `"active"`: an action without `invalidates` refetches every read query                                                                      |

Watch the defaults at work in [Caching](./caching.md), which has a live demo of an entry going from fresh to stale to garbage-collected.
