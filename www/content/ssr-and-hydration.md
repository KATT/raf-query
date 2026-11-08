---
title: SSR and hydration
description: How the server's query cache streams to the browser, pending queries included, and how the browser reconciles it with its own cache.
section: Server rendering
order: 1
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

On the server, only loaders and server components start requests. A render never does: see [Queries nothing started on the server](#queries-nothing-started-on-the-server).

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

A component that reads a query with no data, no error and no request in flight on a server client doesn't start the request. Its read rejects, `use()` throws, and React renders the nearest Suspense fallback in the HTML. The browser renders that boundary again, and its read starts the query there. This happens to a [`waterfallHandle`](./request-waterfalls.md#render-time-inputs-waterfallhandle)'s query, to a [browser-only query](#browser-only-queries), and to a query the server's cache dropped after its loader ran. Put a Suspense boundary around such readers, or start the query in a loader to have it in the HTML.

React sees that read as an error it recovers from. The error has the digest Next.js uses for `ssr: false`, so Next.js reports nothing. Elsewhere, React calls the server render's `onError` and, while hydrating, the browser's [`onRecoverableError`](https://react.dev/reference/react-dom/client/hydrateRoot#parameters). TanStack Start's default stream handler logs it, and React Router's default `entry.server.tsx` logs it and answers 500. `isBrowserRenderError(error)` from `@raf-query/react` tells the two apart: return the error's `digest` from `onError` and skip it there, and skip it in `onRecoverableError`, which gets the digest back from the server.

In TanStack Start, a [server entry](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point) renders the page with that `onError`, and a [client entry](https://tanstack.com/start/latest/docs/framework/react/guide/client-entry-point) hydrates with that `onRecoverableError`:

```sample
tanstack-start/src/server.ts
```

```sample
tanstack-start/src/client.tsx
```

In React Router Framework Mode, the same goes in [`entry.server.tsx`](https://reactrouter.com/api/framework-conventions/entry.server.tsx) and [`entry.client.tsx`](https://reactrouter.com/api/framework-conventions/entry.client.tsx):

```sample
react-router/app/entry.server.tsx
```

```sample
react-router/app/entry.client.tsx
```

## Errors

The stream sends entries with data, with a `fail()` value, or with a request in flight. A query that had already thrown an unexpected error when its entry would have been sent stays on the server, and the browser fetches it again when something reads it.

A query sent while pending crosses as a promise. If it returns `fail()` on the server, the browser gets the same [expected error](./query-functions.md#expected-errors). If it throws, the promise rejects with a `RedactedError` that names the query but not the message, so server internals (SQL errors, stack traces) don't leak into the page. The browser treats it like any failed load: the reader throws to its error boundary, and resetting the boundary with `resetOne` refetches the query from the browser. Pass `keepErrors: true` in the integration's `dehydrateOptions` to send the original error instead.

## Browser-only queries

Some data only the browser can know: a push subscription, a notification permission, a service worker, a media query. That still belongs in the cache, with the same factory, handle and invalidation. Disable it where `window` doesn't exist, so the server never runs it:

```sample
tanstack-start/src/docs/ssr-and-hydration.ts#browser-only-queries
```

A server client never starts a disabled query and never sends it. A loader that also runs on the server starts it with a `prefetch` entry: `load` returns its handle on the server too, and the browser starts the request when the loader or the first read runs there. `swr` and `revalidate` entries can't wait for it on the server, so `load` rejects with `QueryDisabledError`.

On the server, a disabled query with no data reads like any [query nothing started there](#queries-nothing-started-on-the-server): put the component that `use()`s it inside a Suspense boundary, and React sends the fallback from the server and renders the content in the browser.

```sample
tanstack-start/src/docs/ssr-and-hydration.tsx#push-state
```

React reports that boundary to `onRecoverableError` while hydrating; `isBrowserRenderError` tells it apart from real errors.

## When the browser already has data

On client-side navigations in Next.js, server components render again and send their cache entries with the RSC payload, and React Router's loaders return a new snapshot, while the browser may already have the same entries. The browser takes whichever copy is newer, by when it was fetched (`updatedAt`; server and browser clocks should agree):

- No data, no request of its own: it resumes the server's pending request.
- Data, or its own request in flight: it waits for the server's copy and takes it if newer.
- If it keeps its own copy (the server's is older, as in a payload the router replays from its cache on back and forward, or the server's request failed), it refetches it if a component reads it and it's stale.

## Serialization

Data, keys and inputs cross the wire, so they must be serializable by the framework's serializer. TanStack Start uses [Seroval](https://github.com/lxsmnsyc/seroval), Next.js uses React's RSC serialization, and React Router uses [turbo-stream](https://github.com/jacob-ebey/turbo-stream): all three handle `Date`, `Map`, `Set`, `BigInt` and promises. `meta` stays on the server: the browser reads it from its own factories.

Only send what's serializable. These docs, for instance, cache each demo's code module as a query, and a module full of components can't cross the wire. The router integration's `filter` option keeps those entries out of the stream. A `filter` replaces the default one, `canDehydrate` (entries with data, a `fail()` value, or a request in flight), so combine the two:

```sample
tanstack-start/src/docs/ssr-and-hydration.ts#serialization
```

## Integrations

- [TanStack Start](./tanstack-start.md): `setupRouterIntegration` streams the router's query client.
- [React Server Components](./react-server-components.md): `HydrationBoundary` for the Next.js App Router and other RSC frameworks.
- [React Router](./react-router.md): `HydrationBoundary` for the snapshot each Framework Mode loader returns.

Without an integration, `@raf-query/react/hydration` has the pieces they use: `dehydrate(client)` snapshots the cache, `dehydrateStream(client)` snapshots it and then streams entries as they start and settle, and `hydrate(client, state)` writes a snapshot into a client. `HydrationBoundary` takes a snapshot as its `state` prop and hydrates it while rendering.
