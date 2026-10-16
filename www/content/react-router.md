---
title: React Router
description: Start queries in React Router Framework Mode loaders, dehydrate the cache, and hydrate it with HydrationBoundary.
section: Server rendering
order: 4
---

In [React Router Framework Mode](https://reactrouter.com/start/modes#framework), loaders start the queries. Each loader dehydrates its request's cache into the loader data, and `HydrationBoundary` from `@raf-query/react/react-router` writes it into the browser's client.

If you can choose the router, prefer [TanStack Start](./tanstack-start.md). Its loaders run in the browser on client navigations, so a link preloaded on hover starts the next page's queries in the browser's cache, and the click uses them. React Router runs the loaders on the server for each navigation, and the click doesn't use what a prefetch loaded: see [Prefetching links](#prefetching-links).

## Setup

One `QueryClient` per browser tab, in the root route's component:

```sample
react-router/app/root.tsx#app
```

Mount DevTools only when `import.meta.env.DEV` is true so Vite drops the panel from production builds. The [example app](./examples.md) always renders it, so the panel stays available in the deployed demo.

## Loaders

Each loader creates a `QueryClient` for its request, starts every query the route needs, and returns the handles with a dehydrated snapshot of the cache:

```sample
react-router/app/routes/posts.$slug.tsx#loader
```

The route component wraps what it renders in a `HydrationBoundary` with that snapshot, and passes the handles down:

```sample
react-router/app/routes/posts.$slug.tsx#component
```

```sample
react-router/app/components/comments.tsx#component
```

- Create a **new `QueryClient` in each loader**. A module-level client would share data between requests and users.
- **`dehydrate(qc)`** takes entries with data and entries still loading. [Single Fetch](https://reactrouter.com/explanation/single-fetch) streams promises, so a `prefetch` that is still loading resolves in the browser when the server's request does, and the browser doesn't fetch it again.
- **`HydrationBoundary`** writes the entries into the provider's client: entries the browser doesn't have yet while it renders, so its children read them, and the rest once it commits. The browser keeps whichever copy of an entry is newer. See [SSR and hydration](./ssr-and-hydration.md#when-the-browser-already-has-data).
- `await qc.ensure(...)` returns a handle with the `data`, for deciding on a redirect or building another query's input in the loader. Pass it to components as a `QueryHandleWithData`: `useQuery` returns the data without a promise, and follows later refetches. See [Handles](./handles.md).

## What the integration is

`@raf-query/react/react-router` exports `HydrationBoundary`, which takes a dehydrated state. The cache verbs, handles and `useQuery` are the same as everywhere else. React Router has no hooks for streaming a cache with the page, so each loader returns its snapshot in its data. Options the other integrations take as `dehydrateOptions`, such as `keepErrors` and `filter`, go to `dehydrate(qc, options)`.

`react-router` isn't a peer dependency: the entry imports nothing from it.

## Pending UI

While a link navigation is loading the next route, show pending state with React Router, not [`useIsFetching`](./background-fetching-indicators.md#useisfetching). [`useNavigation`](https://reactrouter.com/api/hooks/useNavigation) reports a navigation in progress, and `NavLink` reports its own:

```sample
react-router/app/docs/react-router.tsx#pending-ui
```

Per-query background refetches after the page has rendered use `controls.isFetching`. See [Background fetching indicators](./background-fetching-indicators.md).

## Prefetching links

`prefetch="intent"` on a `Link` or `NavLink` preloads the route's modules and requests its loader data when the user hovers or focuses the link (`"render"` does it when the link renders, `"viewport"` when it scrolls into view, and `"none"`, the default, never). That request runs the loaders on the server, but React Router doesn't keep its response: the click requests the loader data again, and the loaders and their queries run a second time. What a prefetch saves is loading the route's code.

In TanStack Router, the navigation reuses a route preloaded in the last 30 seconds, or joins its loader if it's still running ([Preloading](https://tanstack.com/router/latest/docs/framework/react/guide/preloading)). Its loaders run in the browser, so the queries a preload starts land in the browser's cache, and the navigation's loader finds them there even once the preload is stale. See [TanStack Start](./tanstack-start.md).

## Search params

Read search params from `args.request.url` in the loader, validate them, and pass them as the input. React Router runs the loader again when they change. See [URL state and pagination](./url-state-and-pagination.md) for what to show while it loads.

## Server and browser requests

Loaders run on the server, for the first page load and for each client navigation, so their client starts with an empty cache every time. Components refetch from the browser. A factory's `queryFn` runs in both places, and has to reach the same data as the same user in both:

- **On the server**, a relative `fetch("/api/...")` has no page origin to resolve against, and the browser's cookies aren't sent unless you forward them from `args.request`.
- **In the browser**, `fetch` sends the user's cookies to your origin.

[`examples/react-router`](https://github.com/KATT/raf-query/tree/main/examples/react-router) serves its API from a resource route and gives its API client the page request's cookies while a loader runs, in `app/settings.ts` and `app/api.ts`. Loaders call the API in the same process, and the browser calls it over HTTP.

## Mutations

Write from the browser, then invalidate the queries the write changed with `useQueryClient().invalidate(...)`, as in [Mutations](./mutations.md). React Router [actions](https://reactrouter.com/start/framework/actions) work too: after one, React Router runs the page's loaders again, and their snapshots carry the new data.

## Example

[`examples/react-router`](https://github.com/KATT/raf-query/tree/main/examples/react-router) is the same issue tracker as the TanStack Start and Next.js examples, so the integrations can be compared side by side.
