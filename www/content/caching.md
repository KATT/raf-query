---
title: Caching
description: The life of a cache entry, from the first request through background refetches to inactivity and garbage collection.
section: Guides
order: 8
---

> [!NOTE]
> Read [Important defaults](./important-defaults.md) before this guide.

This example follows one entry through its life:

- reads with and without cached data
- background refetching
- inactive entries
- garbage collection

Assume the default `gcTime` of **5 minutes** and the default `staleTime` of `0`.

1. **A loader prefetches `todosQuery()` and a component reads its handle.**
   - Nothing is cached under `["todos"]` yet, so the component suspends and a request starts.
   - When it completes, the data is cached under `["todos"]` and the component renders it.
   - The data counts as stale after `staleTime`: immediately, by default.
2. **A second component reads the same handle elsewhere on the page.**
   - The cache already has data for `["todos"]`, so it renders at once.
   - Reading never fetches: there is no refetch on mount, so no request starts.
3. **The user navigates away and comes back.**
   - The loader runs again and calls `prefetch`. The data is stale, so it's returned at once and refetched in the background.
   - When the refetch completes, both readers re-render with the new data. If nothing changed, structural sharing keeps the same promise, and nothing re-renders at all.
4. **Every component reading `["todos"]` unmounts.**
   - The entry has no readers, so it's **inactive**. A garbage-collection timer starts for `gcTime` (5 minutes).
5. **The user returns before the timer fires.**
   - The entry is read again, so the timer stops. The cached data renders at once while the loader's `prefetch` refetches it.
6. **The last reader unmounts again, and nothing reads `["todos"]` for 5 minutes.**
   - The entry and its data are deleted.

Try it. The demo's `todosQuery` has a `staleTime` of 5 seconds and a `gcTime` of 10, so you can watch the whole lifecycle in its Queries panel:

```demo
caching
```

## Fresh, stale and inactive

The devtools label each entry with one of these statuses:

| Status     | Meaning                                    |
| ---------- | ------------------------------------------ |
| `fetching` | A request is in flight                     |
| `error`    | The last request failed                    |
| `stale`    | Read, and older than `staleTime`           |
| `fresh`    | Read, and within `staleTime`               |
| `inactive` | Nothing reads it; it's removed at `gcTime` |

The demo's Queries panel shows the same states side by side: the data (fresh, stale or error), the readers (inactive at zero), and whether a request is loading.

Only **read** entries refetch on window focus and reconnect. An inactive entry waits for whatever starts it next.

## Choosing staleTime

`staleTime` is how long you're happy to show data without checking. Some rules of thumb:

- **Data the user just changed**: leave it at `0` and [invalidate](./query-invalidation.md) after writes.
- **Lists and dashboards**: a few seconds to a minute, so moving between pages doesn't refetch every time.
- **Reference data** (countries, feature flags, these docs' pages): `Infinity`. It never goes stale on its own.

These docs load each page's content as a query with `staleTime: Infinity`: content only changes with a deploy, so a page you've visited, or just hovered, opens instantly.

## Choosing gcTime

`gcTime` is memory versus revisits. Entries are small, so the default five minutes rarely needs changing. Raise it for data that's expensive to load and likely to be revisited; set it to `Infinity` for data you want to keep for the whole session. On the server it's always `Infinity`: a request's cache lives only as long as the request.

## Initial data

`initialData` gives a new entry data before any request: a default, data bundled with the app, or a value computed from the input. The entry caches it as if a request had returned it:

```sample
tanstack-start/src/docs/caching.ts#initial-data
```

- **Readers don't suspend**, and `ensure` resolves with it at once.
- **It ages like fetched data.** It counts as fetched at `initialDataUpdatedAt`, by default the moment the entry got it, so it's fresh for `staleTime`, then refetched by whatever asks for it next. Set `initialDataUpdatedAt` to when the value was last current, or to `0` to refetch it at the first chance.
- **It only fills new entries.** The first factory call for a key the cache doesn't have seeds it. It never replaces data the entry has, fetched, written with `setData` or hydrated, and [`reset`](./api-reference.md#queryclient) goes back to it.
- **A function is called once per new entry**, so an expensive value is only computed when it's used.
- **`undefined` is data**, here as everywhere: `initialData: undefined` caches `undefined`. Leave the option out to seed nothing, for instance with `...(value !== undefined && { initialData: value })`. TypeScript doesn't catch an `undefined` passed to an optional option.

On the server, `initialData` is cached data too: the server renders it, and since a server client [doesn't refetch cached data](./ssr-and-hydration.md#server-clients), it doesn't run the query unless `invalidate` marked it. An entry that still holds its initial data isn't sent to the browser: the browser's call to the same factory seeds the same value, so `initialData` must give the same result on both sides, as a render must. Data the server fetched or wrote does cross, and replaces the browser's initial data whenever it was fetched.
