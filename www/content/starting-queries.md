---
title: Starting queries
description: "Start a page's queries before it renders with load, and choose per query what the page waits for: prefetch, swr or revalidate."
section: Guides
order: 5
---

A page's queries start where its inputs are known, before anything renders: a route loader, a server component, or an event handler such as a link's hover. They all do it the same way, with `load`.

`load(client, entries)` takes the client and a record of **entries**, one per query. Each entry names a factory and its input, and its kind decides what `load` waits for. It starts every entry before it waits for any, and resolves to `[handles, data]`: a [handle](./reading-queries.md#handles) per entry, and the data of the entries it waited for.

```sample framework="tanstack-start"
tanstack-start/src/routes/posts.$slug.tsx#route
```

```sample framework="nextjs"
nextjs/src/docs/nextjs.fetch.tsx#fetch
```

```sample framework="react-router"
react-router/app/routes/posts.$slug.tsx#loader
```

## The three entries

| Entry                        | Cache miss            | Stale data                                    |
| ---------------------------- | --------------------- | --------------------------------------------- |
| `prefetch(factory, input)`   | Starts the request    | Refetches in the background                   |
| `swr(factory, input)`        | Waits for the request | Resolves at once, refetches in the background |
| `revalidate(factory, input)` | Waits for the request | Waits for the refetch                         |

All three reuse fresh data without a request. The names come from HTTP's [`Cache-Control`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control), with `staleTime` as the max-age: `swr` is [`stale-while-revalidate`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#stale-while-revalidate), which serves stale data while it refetches, and `revalidate` is [`must-revalidate`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#must-revalidate), which refetches stale data before using it.

- **`prefetch`** never holds anything up. The page renders at once, and each part still waiting for data shows its nearest [Suspense](https://react.dev/reference/react/Suspense) fallback.
- **`swr`** holds up only the first visit. Returning to a page shows the cached data at once, then fresh data.
- **`revalidate`** always resolves with fresh data, at the cost of a round trip whenever the cache is stale.

Try each. The demo opens on a post, and its data goes stale after 5 seconds:

```demo
starting-queries
```

## prefetch or swr?

Neither is faster: both start the request at the same moment. The difference is what the user sees while it loads:

- **`prefetch` shows the page now**, with skeletons where data is still on its way.
- **`swr` shows the page when the data is in.** Until then, the router keeps the previous page on screen, or shows its own pending UI.

Choose per query: wait with `swr` for what the page can't lay out without (the post), and `prefetch` the rest (comments, sidebars, counts). A failed `prefetch` also stays local: its error surfaces where the data is read, while a failed `swr` or `revalidate` makes `load` reject and reaches the route's error boundary.

> [!IMPORTANT]
> Put every query a page needs in one `load`. It starts every entry before it waits for any, so a waiting entry never delays the others, whatever their order. Two `await load(…)` in a row are a [waterfall](./request-waterfalls.md).

## Where the code runs

`swr` and `revalidate` differ only when the client keeps its cache between navigations:

- **In the browser**, the tab's client outlives navigations: a TanStack Router loader, a React Router `clientLoader`, an event handler. Use `swr` for what the page waits for, and `prefetch` for the rest.
- **On the server**, every request gets a new, empty client: server components, React Router's `loader`. Every query is a cache miss, so `swr` waits exactly like `revalidate`, every time. Use `revalidate` for what the page waits for (it says what happens), and `prefetch` for what can stream in.

Use `revalidate` in the browser only when the code needs the data fresh, not just present: a loader that redirects based on it, or a script or test.

## Using the data

`data` holds what the waiting entries resolved with, typed by their factories. The code that called `load` can branch on it, redirect, or render it in a server component. It's the cache entry's own object (through `select`), not a copy:

```sample
tanstack-start/src/docs/starting-queries.ts#awaiting-several-queries
```

Components still read the handle rather than `data`, so they follow later refetches and invalidations. `load` rejects as soon as one waiting entry fails.

## Conditional queries

Some queries only start for some requests, such as drafts that only an admin sees. Put `skipToken` in place of the entry when the query shouldn't start:

```sample
tanstack-start/src/docs/starting-queries.conditional-queries.tsx#loader
```

A `skipToken` starts nothing. Its handle is `undefined`, typed `QueryHandle<typeof draftsQuery> | undefined`, and `data` has no key for it. Render the component that reads the query only when there's a handle:

```sample
tanstack-start/src/docs/starting-queries.conditional-queries.tsx#component
```

The condition comes from what the code that starts the query knows: the route's params and search, its context, or another entry's data. Data only the browser has, such as a permission, has no loader entry: see [Browser-only queries](./ssr-and-hydration.md#browser-only-queries).

## Preloading on intent

Outside loaders, call `load` yourself. Starting a query when the pointer enters a link means the click finds it cached or in flight:

```sample
tanstack-start/src/docs/starting-queries.tsx#preloading-on-intent
```

Some routers do this for you: TanStack Router's [`defaultPreload: "intent"`](https://tanstack.com/router/latest/docs/framework/react/guide/preloading) runs a route's loader on hover. See your framework's guide for what its link prefetching does.

## Paged queries

A [paged factory](./infinite-queries.md) works with every entry. `swr` and `revalidate` load its first page; pass `{ pages: n }` after the input to load more up front.

## Behavior

- Every entry dedupes against the cache: a request already in flight for the query is joined, not repeated.
- Loaders typically run on every navigation, so returning to a page shows what's cached at once and refreshes what's stale.
- On a server client, `staleTime` doesn't apply: what the request fetched is fresh for that request. `prefetch` and `swr` reuse cached data even after an [invalidation](./query-invalidation.md#invalidation-on-the-server); `revalidate` reuses it until an invalidation, then waits for the refetch.
- A failed `prefetch` never makes `load` reject. A failed `swr` or `revalidate` does.
