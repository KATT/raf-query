---
title: Overview
description: What raf-query is, the problem it solves, and the three pieces every page uses — a query factory, load, and useQuery with use().
section: Getting started
order: 1
---

raf-query is a data-fetching library for React built around **render-as-you-fetch**: every request a page needs starts before the page renders, and components read the results with React's [`use()`](https://react.dev/reference/react/use) under [Suspense](https://react.dev/reference/react/Suspense). It's a cache of asynchronous data, with dedupe, staleness, background refetching, infinite paging and streaming SSR hydration, and an API shaped so requests start where React recommends: in route loaders and server components.

> [!NOTE]
> raf-query is early. The packages are on npm at `0.x`, and the API can still change between minor releases.

## The problem

Most React data fetching starts in a component. It renders, discovers it needs data, and asks for it. When its children do the same, each level waits for the one above: a post, then its comments, then the author, one round trip after another. That's a **request waterfall**, and it's the default shape of fetch-on-render code.

The page usually knows everything it needs from the URL alone. Start every request the moment the navigation starts, and they run side by side while the components render. Routers and React Server Components give you a place to do that. raf-query gives you a cache built for that place.

## How it works

Every page uses three pieces.

**A query factory** describes a query once: its key, and the function that fetches it. It takes one serializable input:

```sample title="queries.ts"
tanstack-start/src/docs/overview.ts#a-taste
```

`queryOptions` is the app's own: a small file, `raf.ts`, binds it to the app's query client, so a query can set the options of that client's [plugins](./plugins.md), such as retries. The [quick start](./quick-start.md#2-create-the-client) sets it up.

**`load`** starts queries where the page's input is known: a route loader, a server component, or an event handler. Each entry says whether to wait for the data, and `load` returns a **handle** per query: its key and input, plain data that crosses from a loader or a server to the browser.

**`useQuery`** reads a handle in a component. It returns a **thenable**, a promise that React's `use()` can read synchronously once the data is there, so a query the loader waited for renders at once and one still in flight suspends to the nearest boundary.

```sample title="src/routes/posts.$slug.tsx" framework="tanstack-start"
tanstack-start/src/docs/overview.route.tsx#a-taste
```

```sample framework="nextjs"
nextjs/src/app/(blog)/posts/[slug]/page.tsx#page
```

```sample framework="nextjs"
nextjs/src/app/(blog)/components/post.tsx#component
```

```sample title="app/routes/posts.$slug.tsx" framework="react-router"
react-router/app/routes/blog.$slug.tsx#hero
```

Whatever starts the queries, a loader or a server component, decides when each request starts and what the page waits for. Components only read. Try both strategies:

```demo
starting-queries
```

## Principles

- **Start where the inputs are known.** Loaders and server components start queries; components read them. Fetching in render is possible, but it's an escape hatch named after what it causes: [`waterfallHandle`](./request-waterfalls.md#render-time-inputs-waterfallhandle).
- **The URL is the input.** Filters, sort and page live in the URL, so the loader starts the right query on every navigation, and every view can be linked to.
- **React does the rest.** Suspense shows what's loading, transitions keep the old screen while the new one loads, and Actions with `useOptimistic` handle writes. The cache invalidates and refetches after them.
- **Pay for what you use.** A client only caches. Retries, refetching on focus and reconnect, polling and hydration are opt-in, so an app ships only what it turns on.

## Where it runs

raf-query works with any React 19 app that can start requests before rendering. The [integrations](./installation.md#pick-your-integration) cover TanStack Start and TanStack Router, React Server Components (the Next.js App Router and others), and React Router, server-rendered or client-only.

## Next steps

- [Install it](./installation.md), then build a page in the [quick start](./quick-start.md).
- Already know TanStack Query? [Coming from TanStack Query](./comparison.md) maps what you know.
- The guides start with [important defaults](./important-defaults.md). Most have live demos you can poke at.
