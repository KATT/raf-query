---
title: Request waterfalls
description: What a request waterfall is, why it's the biggest performance problem in data fetching, and how loaders, routes and backends remove them.
section: Guides
order: 11
---

A request waterfall is a request that can't start until another one has finished. Each level of the waterfall costs a full round trip, and on a slow connection a round trip can be hundreds of milliseconds. Removing waterfalls is usually the single most effective thing you can do for an app's loading time.

raf-query is designed around this. Queries start in route loaders and server components, where everything a page needs is known up front, so they start together:

```
1. |-> Post
1. |-> Comments
1. |-> Author
```

instead of one after the other as each component renders and discovers what it needs:

```
1. |-> Post
2.   |-> Comments
3.     |-> Author
```

The demo below runs the same page both ways. Open a post with each strategy and watch the Queries panel: with the loader, all three requests load at once; in render, they load one after another.

```demo
waterfalls
```

## Fetch-on-render

The classic waterfall comes from fetching where data is used. A component fetches its data, suspends, and only renders its children, which fetch their own data, once that request is done:

```sample
tanstack-start/src/docs/request-waterfalls.tsx#fetch-on-render
```

Suspense makes this worse, not better: a suspending component renders nothing below it, so its children can't even begin to fetch.

raf-query has no fetch-on-render hook. The loader starts every query, and `useQuery` reads what it started:

```sample
tanstack-start/src/routes/posts.$slug.tsx#route
```

Both requests start the moment the navigation does, before any component renders. With `defaultPreload: "intent"`, they start when the user hovers the link.

## Start every query before awaiting any

Inside a loader, put every query in one `load`. It starts every entry before it waits for any, so their order doesn't matter. A second `await load(…)` after a first turns two parallel requests back into a waterfall:

```sample
tanstack-start/src/docs/request-waterfalls.ts#start-every-query-before-awaiting-any
```

Several queries the route can't render without are `swr` entries in the same `load`, which waits for them together.

## Dependent queries

A query whose input comes from another query's result is a waterfall by construction. A post page that shows "more by this author" needs `authorQuery({ id: post.authorId })`, and `authorId` is only known once the post has loaded, so the author's request can't start before the post's has finished. Fix it where the data is shaped, so every query a route needs can start from what the URL already holds:

- **Put the input in the route.** If the page is about an author, their id belongs in the path (`/authors/$authorId`), not in a lookup on one of their posts.
- **Have the backend resolve it.** The server already knows the session and the relations, so an endpoint can return the child with its parent (the post with its author), or be keyed by what the client has (`GET /posts/:slug/author` instead of the post then `GET /authors/:id`). The demo above does this: its loader starts the author from the post's id.

<details>
<summary>Example: the post's author</summary>

A post page needs the post and its author, and the author's id is a field of the post:

```sample
tanstack-start/src/docs/request-waterfalls.author-waterfall.ts#author-waterfall
```

With a 150 ms round trip, the author can't arrive before 300 ms, and the navigation waits for the post before the author's request can start.

Fix it in the backend: the server can look up the post's author itself, so give it an endpoint keyed by the slug the URL already has.

```sample
tanstack-start/src/docs/request-waterfalls.author-backend.ts#author-backend
```

Or fix it in the routes: a page about the author is linked from places that already know them (a post's byline, a list of authors), so those links can put the author's id in the URL.

Either way, both requests start together, and the page is ready after one round trip instead of two.

</details>

When the data really can't be reshaped (a third-party API you don't control), you have two options, and both pay the extra round trip:

- **In the loader**: load the post with `revalidate`, then build the author's input from `load`'s data. The navigation waits for both.
- **In a component**: read the author with a `waterfallHandle`, below. The rest of the page renders first.

## Render-time inputs: waterfallHandle

When an input is only known at render time (the post's `authorId`), no loader can start the query. `waterfallHandle` builds its handle from the factory and the input, so the consumer looks the same as one fed by a loader. It starts nothing: the component that reads the handle fetches while it renders.

```sample
tanstack-start/src/docs/request-waterfalls.render-time-inputs-waterfallhandle.tsx#render-time-inputs-waterfallhandle
```

The reader fetches only when the cache has no data for the query. Cached data, even stale, renders as is, and refetches the way any read query does: when it's invalidated, on window focus, and so on.

The name is the warning: each waterfall is an extra round trip after render. Search a codebase for `waterfallHandle` and you have a list of every waterfall in it. In development, `useQuery` warns in the console when it fetches a query that nothing loaded and that didn't come from `waterfallHandle`, so accidental waterfalls show up too.

On the server, the waterfall happens there or moves to the browser. In TanStack Start, the reader fetches during the server render and the router streams the result. In React Router, it fetches during the server render, and the browser fetches it again. Under server components, the reader's Suspense boundary renders its fallback on the server, and the query loads in the browser (see [SSR and hydration](./ssr-and-hydration.md#queries-nothing-started-on-the-server)). To fetch it once, on the server, start the dependent query in the loader or server component instead:

```sample
tanstack-start/src/docs/request-waterfalls.tsx#fetch-then-prefetch
```

## Code splitting

Lazy-loaded route components are another source of waterfalls: the code has to download before it can render and discover what to fetch. Loaders avoid this too. A route's loader is part of the route definition, not the lazy component, so the router runs it in parallel with downloading the component's code.

These docs do the same: each page's demos are separate chunks, and the page's loader starts loading them alongside the page's content instead of after it renders.

## Summary

- Start queries in loaders and server components, never in render.
- Start every query a loader needs in one `load`.
- Shape data so a route's inputs come from the URL, not from other queries.
- Use `waterfallHandle` only when you can't, and treat each one as a known cost.
