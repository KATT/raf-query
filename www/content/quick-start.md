---
title: Quick start
description: Build a blog post page with paged comments in TanStack Start, Next.js or React Router — define the queries, start them before render, read them with use(), and add a comment.
section: Getting started
order: 3
---

This page builds a blog post with its comments, the shape of most pages: something the page can't render without (the post), something that can stream in (the comments, loaded page by page), and a write (adding a comment). It covers the four things every raf-query app does:

1. **Define** each query once, as a factory.
2. **Start** the page's queries before it renders, with `load`.
3. **Read** them in components, with `useQuery` and `use()`.
4. **Write**, then invalidate what changed.

Steps that differ by framework show a tab for each of TanStack Start, Next.js and React Router. Pick yours once: every page of these docs follows the choice, and remembers it.

## 1. Install

```bash
npm install @raf-query/react
```

See [Installation](./installation.md) for the requirements.

## 2. Define the queries

A query is a **factory**: a function of at most one argument, its **input**, that returns `queryOptions(...)`. The comments load page by page, so their factory returns `infiniteQueryOptions(...)` instead. Everything else in raf-query takes the factory, so the data's type flows from the `queryFn` to every component that reads it.

```sample title="queries.ts"
react-router/app/queries.ts#home
```

- The input is serializable (`{ slug }`), because it travels with the query from the server to the browser.
- The keys come from **groups**, which name sets of queries so one call can [invalidate](./query-invalidation.md) them all.
- `listComments` returns a page and the next page's cursor, `null` after the last one. `getNextPageParam` hands that cursor to the next request.

## 3. Create the client

The client is the cache. On the server, make one **per request**, so users never share data. In the browser, make one per tab. `QueryClientProvider` gives it to the components below it.

```sample framework="tanstack-start"
tanstack-start/src/query-client.ts
```

```sample framework="tanstack-start"
tanstack-start/src/router.tsx
```

```sample framework="tanstack-start"
tanstack-start/src/providers.tsx
```

```sample framework="tanstack-start"
tanstack-start/src/routes/__root.tsx
```

```sample framework="nextjs"
nextjs/src/query-client.ts
```

```sample framework="nextjs"
nextjs/src/components/providers.tsx
```

```sample framework="nextjs"
nextjs/src/app/layout.tsx
```

```sample framework="react-router"
react-router/app/query-client.ts
```

```sample framework="react-router"
react-router/app/providers.tsx
```

```sample title="app/root.tsx" framework="react-router"
react-router/app/root.tsx#middleware
```

```sample title="app/root.tsx" framework="react-router"
react-router/app/root.tsx#app
```

A bare client only caches and dedupes. `recommended()` adds what most apps want: [retries](./retries.md), refetching stale data on [window focus](./window-focus-refetching.md) and reconnect, and [polling](./polling.md). The `staleTime` in `defaults` says how long every query's data counts as fresh. [Important defaults](./important-defaults.md) explains each.

The integration also moves the server's cache to the browser, so data loaded during server rendering is never fetched twice. Your framework's guide covers the details: [TanStack Start](./tanstack-start.md), [React Server Components](./react-server-components.md), [React Router](./react-router.md).

## 4. Start the queries

The page's input, the post's `slug`, is in the URL, so every query can start before anything renders: in a route loader, or in a server component. `load` takes the client and one **entry** per query, starts them all at once, and resolves with a **handle** per query.

```sample framework="tanstack-start"
tanstack-start/src/routes/posts.$slug.tsx#route
```

```sample framework="nextjs"
nextjs/src/app/(blog)/posts/[slug]/page.tsx#page
```

```sample framework="react-router"
react-router/app/routes/posts.$slug.tsx#loader
```

The entry decides what `load` waits for:

| Entry        | Waits for                     | Use for                                            |
| ------------ | ----------------------------- | -------------------------------------------------- |
| `prefetch`   | Nothing                       | Data that can stream in behind a Suspense fallback |
| `swr`        | Data, when the cache has none | What the page can't render without, in the browser |
| `revalidate` | Fresh data                    | The same, in code that only runs on the server     |

A TanStack Router loader runs in the browser, on a client that keeps its cache between navigations, so `swr` waits only on the first visit and shows cached data at once after that. Server components and React Router's `loader` start every request with an empty cache, so there `revalidate` or `prefetch` say what you mean. [Starting queries](./starting-queries.md) has the details and a demo.

A handle is `{ queryKey, input }` and nothing else, so it serializes for free: it crosses from a loader or a server component to the browser, and the data follows through the cache.

## 5. Read them in components

```sample framework="tanstack-start"
tanstack-start/src/routes/posts.$slug.tsx#component
```

```sample framework="nextjs"
nextjs/src/app/(blog)/components/post.tsx#component
```

```sample framework="nextjs"
nextjs/src/app/(blog)/components/comments.tsx#component
```

```sample title="app/routes/posts.$slug.tsx" framework="react-router"
react-router/app/routes/posts.$slug.tsx#component
```

```sample framework="react-router"
react-router/app/components/comments.tsx#component
```

`useQuery(factory, handle)` returns a **thenable** and the query's state. A thenable is a promise that also carries its `status` and `value`, which React's `use()` reads: when the data is in the cache, `use()` returns it synchronously; otherwise it suspends until the data lands.

- The factory comes along with the handle because the handle is plain data and can't carry the `queryFn`.
- A query the page waited for reads without suspending. The comments may still be loading, so they sit in their own `<Suspense>` boundary and the post renders without them.
- `useInfiniteQuery` reads the paged comments as `{ pages, pageParams }`, and its state has `fetchNextPage()`, `hasNextPage` and `isFetchingNextPage` for a "Load more" button. See [Infinite queries](./infinite-queries.md).
- When the cache updates (a refetch, an invalidation), every reader re-renders with the new data, without suspending.

## 6. Add a comment

There is no mutation hook: a write is a React action. Await the write, then await an invalidation of what it changed:

```sample
tanstack-start/src/routes/posts.$slug.tsx#add-comment
```

`invalidateMany` marks this post's comments stale and refetches them, since they're on screen. It resolves once the refetch has settled, so the form stays pending until the new comment shows. [Mutations](./mutations.md) covers optimistic updates and errors.

## Next steps

- [Important defaults](./important-defaults.md): when raf-query fetches, and when it doesn't.
- [Starting queries](./starting-queries.md) and [Reading queries](./reading-queries.md): the two halves of every page, in depth.
- Your framework's guide: [TanStack Start](./tanstack-start.md), [React Server Components](./react-server-components.md) or [React Router](./react-router.md).
- [Examples](./examples.md): a full issue tracker in each framework.
