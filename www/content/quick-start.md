---
title: Quick start
description: Create a query client, define a post and its paged comments, start them in a TanStack Start loader, read them with useQuery, useInfiniteQuery and use(), and add a comment.
section: Getting started
order: 3
---

This walks through the three core concepts of raf-query on [TanStack Start](https://tanstack.com/start):

- **Query factories**, which describe a query once
- **Starting queries** in a loader, which hands components a handle
- **Reading queries** with `useQuery` and `use()`

For the Next.js App Router, the same steps apply with a server component in place of the loader: see [React Server Components](./react-server-components.md). For React Router Framework Mode, see [React Router](./react-router.md).

## 1. Create the client

Create one client per router with `createQueryClient`. On the server, `getRouter` runs once per request, so each request gets its own cache; in the browser it runs once per tab.

```sample
tanstack-start/src/query-client.ts
```

```sample
tanstack-start/src/router.tsx
```

`Providers` hands the router's client to the components below it with `QueryClientProvider`. The same component works in [every framework](./ssr-and-hydration.md#the-provider):

```sample
tanstack-start/src/providers.tsx
```

The client does nothing on its own. `recommended()` turns on what most apps want: retries, refetching stale data on window focus and reconnect, polling, and refetching after [actions](./mutations.md). `staleTime` keeps data fresh for 30 seconds, so navigating back to a page doesn't refetch it.

`setupRouterIntegration` streams the server's cache to the browser while the page renders, so data loaded on the server is never fetched twice. In development, [DevTools](./devtools.md) show what's in the cache. Give the root route the client's type:

```sample
tanstack-start/src/routes/__root.tsx
```

## 2. Define the queries

The page is a blog post with its comments. A query is a **factory**: a function of at most one argument that returns `queryOptions(...)`, or `infiniteQueryOptions(...)` for a list that loads page by page, like the comments. The argument is the query's input, here the post's `slug`. Loaders and components call the same factory, so the data's type flows end to end.

```sample
tanstack-start/src/queries.ts#home
```

The keys come from **groups**. `comments` is a group inside `posts`, so one call can [invalidate](./query-invalidation.md) every post query and every comment list at once, or only the comments.

`listComments` returns a page of comments and the cursor of the next one, `null` after the last page. `getNextPageParam` hands that cursor to the next request, as in [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries).

## 3. Start them in the loader

The loader starts both queries in one `load` and returns their **handles**, small `{ queryKey, input }` objects:

```sample
tanstack-start/src/routes/posts.$slug.tsx#route
```

`swr` waits for the post when the cache doesn't have it yet, because the page can't lay out without it. `prefetch` starts the comments without waiting, so the page renders while they're on their way. [Starting queries](./starting-queries.md) covers the trade-off.

## 4. Read them in components

```sample
tanstack-start/src/routes/posts.$slug.tsx#component
```

`useQuery` takes the factory as well as the handle because the handle is plain data, `{ queryKey, input }`, so it can cross from a loader or a server component to the browser, and a function can't: the handle can't carry the `queryFn`, so you pass the factory alongside it.

`useQuery` returns a stable thenable and the query's state. `use()` suspends until the data is there, then returns it. The loader already waited for the post, so the thenable is fulfilled and `use()` returns it without suspending.

The comments may still be loading, so `<Comments>` sits in its own Suspense boundary and the post renders without them. `useInfiniteQuery` reads them as `{ pages, pageParams }`, and its state loads more: `fetchNextPage()` fetches the next page and appends it, `hasNextPage` says whether there is one, and `isFetchingNextPage` is `true` while it loads. See [Infinite queries](./infinite-queries.md).

## 5. Write data with an Action

There is no `useMutation`. Adding a comment is a form action in the component: await the write, then invalidate what it changed with the client from `useQueryClient()`:

```sample
tanstack-start/src/routes/posts.$slug.tsx#add-comment
```

`invalidateMany` takes a list of targets. `[commentsQuery, { slug }]` is this post's comments, and the list refetches every page it has loaded. The verb resolves once that refetch has settled, so the form stays pending until the new comment is on screen. See [Mutations](./mutations.md) for optimistic updates and errors.

## What you get

The cache always dedupes requests, garbage-collects unused entries and keeps unchanged data referentially stable. With `recommended()`, it also retries failures and refetches stale data when the window regains focus. Read [Important defaults](./important-defaults.md) next: they explain when raf-query fetches and when it doesn't.
