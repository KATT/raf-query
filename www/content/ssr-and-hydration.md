---
title: Server rendering and hydration
description: How the server's query cache streams to the browser, pending queries included, and how the browser reconciles it with its own cache.
section: Guides
order: 18
---

With server rendering, the queries a page needs run on the server, and the HTML arrives with the data already in it. raf-query streams the server's cache to the browser as entries start and settle, so the browser starts with the same data and doesn't fetch it again.

Your components never deal with this. A handle only carries a key and an input, and the browser's cache has the entry by the time anything reads it. There is no `initialData` to thread through props, and no hydration boundary to place around each component.

## What happens on a request

1. **The server creates a query client for the request.** Each request gets its own, so users never see each other's data.
2. **Loaders or server components call `load`.** `swr` and `revalidate` entries wait for their data; `prefetch` entries don't.
3. **React renders and streams HTML.** Components reading a pending query suspend, and their Suspense fallbacks go out first.
4. **The cache streams alongside the HTML.** Each entry is sent once, as soon as it starts or settles. Entries still pending cross as **promises**, which resolve in the browser when the server's request finishes.
5. **The browser hydrates.** Its query client receives each entry. A pending entry resumes the server's request instead of starting a new one, so a query never runs twice.
6. **The request ends.** The server's client is cleared and dropped.

## Server clients

`createQueryClient` makes a server client where `window` doesn't exist (set `isServer` to choose). A server client renders once, so it behaves differently:

| Behavior            | Browser                                                         | Server                                                                                            |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Retries             | With the `retry()` link                                         | None, even with `retry()`                                                                         |
| `gcTime`            | 5 minutes by default                                            | Never collected: the cache lives as long as the request                                           |
| Stale cached data   | Refetched (`swr` entries resolve with it and refetch alongside) | Reused: `staleTime` doesn't apply within a request; `revalidate` entries refetch invalidated data |
| Focus and reconnect | Refetch read, stale queries, with their feature                 | Not watched: features start when a provider mounts                                                |

So in a server render, every entry makes at most one request per query, whatever its `staleTime`, unless a write invalidates the query and a `revalidate` entry reads it again.

A server render fetches a query that nothing started, except where server components feed it: see [Queries nothing started on the server](#queries-nothing-started-on-the-server).

## The provider

Every framework provides the client with `QueryClientProvider`. One `Providers` component works in all of them: it takes the router's client when the router makes one, and otherwise creates its own, one per server render and one per browser tab:

```sample
nextjs/src/components/providers.tsx
```

| Framework                               | Renders                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| [TanStack Start](./tanstack-start.md)   | `<Providers client={queryClient}>` in the router's `Wrap`, with the client loaders use |
| [Next.js](./react-server-components.md) | `<Providers>` in the root layout. Server components use their own client per request   |
| [React Router](./react-router.md)       | `<Providers>` in the root route. Loaders use the request's client from middleware      |

`"use client"` makes it a client component in Next.js. Elsewhere the directive does nothing.

## Queries nothing started on the server

A component can read a query that no loader or server component started: a [`waterfallHandle`](./request-waterfalls.md#render-time-inputs-waterfallhandle)'s query, or one the server's cache dropped after its loader ran. What the server render does with it depends on what carries the server's cache to the browser:

| Framework                                                        | A read of a query nothing started, on the server                                                                                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [TanStack Start](./tanstack-start.md)                            | Fetches while rendering. `setupRouterIntegration` streams the entry with the rest of the cache, so the browser resumes it instead of fetching again                                             |
| [React Router](./react-router.md)                                | Fetches while rendering, so the HTML has the data. A loader's snapshot carries only what loaders started, so the browser [fetches the query again](./react-router.md#queries-no-loader-started) |
| [Next.js and other RSC frameworks](./react-server-components.md) | Renders the nearest Suspense fallback, and the query loads in the browser                                                                                                                       |

With server components, the client components' server render has nothing to send its own requests through: only server components' `HydrationBoundary` sends entries. So that `HydrationBoundary` marks the client components' server render as it renders. Below it, a read of a query nothing sent doesn't start the request: its read rejects, `use()` throws, and React renders the nearest Suspense fallback in the HTML. The browser renders that boundary again, and its read starts the query there. Put a Suspense boundary around such readers, or start the query in a server component to have it in the HTML.

React sees that read as an error it recovers from. The error has the digest Next.js uses for `ssr: false`, so Next.js reports nothing. Other RSC frameworks report it to the server render's `onError` and, while hydrating, the browser's [`onRecoverableError`](https://react.dev/reference/react-dom/client/hydrateRoot#parameters).

The mark is set when the first `HydrationBoundary` renders. A client component that renders before it, such as one in a root layout above the page's boundary, still fetches on the server, and the browser fetches that query again.

## Errors

The stream sends entries with data or with a request in flight. A query that had already failed when its entry would have been sent stays on the server, and the browser fetches it again when something reads it.

A query sent while pending crosses as a promise. If it throws on the server, the promise rejects with a `RedactedError` that names the query but not the message, so server internals (SQL errors, stack traces) don't leak into the page. The browser treats it like any failed load: the reader throws to its error boundary, and resetting the boundary with `resetOne` refetches the query from the browser. Pass `keepErrors: true` in the integration's `dehydrateOptions` to send the original error instead.

## Browser-only queries

Some data only the browser can know: a push subscription, a notification permission, a service worker, a media query. That still belongs in the cache, with the same factory, handle and invalidation. Mark its factory `ssr: false`:

```sample
tanstack-start/src/docs/ssr-and-hydration.ts#browser-only-queries
```

A loader starts it like any other query, with `prefetch`:

```sample
tanstack-start/src/docs/ssr-and-hydration.ts#browser-only-loader
```

- **On the server**, a client never starts it: `prefetch` returns its handle and starts nothing, and nothing is sent for it. `swr` and `revalidate` reject, since the server can never have its data (unless something wrote it with `setData`).
- **In the browser**, `prefetch` starts it on a client-side navigation, alongside the route's other queries. After a server render, no loader runs, so the first read starts it.

Read it without suspending, so the server renders a placeholder and the browser fills it in:

```sample
tanstack-start/src/docs/ssr-and-hydration.tsx#push-state
```

On the server, the thenable is `"rejected"` with the error React uses to render a boundary in the browser instead (digest `BAILOUT_TO_CLIENT_SIDE_RENDERING`). A `use()` of it renders the nearest Suspense fallback, and the browser renders the content once the query loads. Next.js reports nothing for that error. Other frameworks report it to the server render's `onError`, and an error outside every Suspense boundary fails the render, so put such a reader under one.

## When the browser already has data

On client-side navigations in Next.js, server components render again and send their cache entries with the RSC payload, and React Router's loaders return a new snapshot, while the browser may already have the same entries. The browser takes whichever copy is newer, by when it was fetched (`updatedAt`; server and browser clocks should agree):

- No data, no request of its own: it resumes the server's pending request.
- Data, or its own request in flight: it waits for the server's copy and takes it if newer.
- If it keeps its own copy (the server's is older, as in a payload the router replays from its cache on back and forward, or the server's request failed), it refetches it if a component reads it and it's stale.

## Serialization

Data, keys and inputs cross the wire, so they must be serializable by the framework's serializer. TanStack Start uses [Seroval](https://github.com/lxsmnsyc/seroval), Next.js uses React's RSC serialization, and React Router uses [turbo-stream](https://github.com/jacob-ebey/turbo-stream): all three handle `Date`, `Map`, `Set`, `BigInt` and promises. `meta` stays on the server: the browser reads it from its own factories.

Only send what's serializable. These docs, for instance, cache each demo's code module as a query, and a module full of components can't cross the wire. The router integration's `filter` option keeps those entries out of the stream. A `filter` replaces the default one, `canDehydrate` (entries with data or a request in flight), so combine the two:

```sample
tanstack-start/src/docs/ssr-and-hydration.ts#serialization
```

## Integrations

- [TanStack Start](./tanstack-start.md): `setupRouterIntegration` streams the router's query client.
- [React Server Components](./react-server-components.md): `HydrationBoundary` for the Next.js App Router and other RSC frameworks.
- [React Router](./react-router.md): `HydrationBoundary` for the snapshot each Framework Mode loader returns.

Without an integration, `@raf-query/react` has the pieces they use: `dehydrate(client)` snapshots the cache, `dehydrateStream(client)` snapshots it and then streams entries as they start and settle, and `hydrate(client, state)` writes a snapshot into a client. `HydrationBoundary` takes a snapshot as its `state` prop and hydrates it while rendering.
