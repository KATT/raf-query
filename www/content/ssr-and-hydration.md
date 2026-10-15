---
title: SSR and hydration
description: How the server's query cache streams to the browser, pending queries included, and how the browser reconciles it with its own cache.
section: Server rendering
order: 1
---

With server rendering, the queries a page needs run on the server, and the HTML arrives with the data already in it. raf-query streams the server's cache to the browser as entries settle, so the browser starts with the same data and doesn't fetch it again.

Your components never deal with this. A handle only carries a key, and the browser's cache has the entry by the time anything reads it. There is no `initialData` to thread through props, and no hydration boundary to place around each component.

## What happens on a request

1. **The server creates a query client for the request.** Each request gets its own, so users never see each other's data.
2. **Loaders or server components start queries.** `ensure` and `fetch` wait; `prefetch` doesn't.
3. **React renders and streams HTML.** Components reading a pending query suspend, and their Suspense fallbacks go out first.
4. **The cache streams alongside the HTML.** Each entry is sent once, as soon as it settles. Entries still pending when the shell is sent cross as **promises**, which resolve in the browser when the server's request finishes.
5. **The browser hydrates.** Its query client receives each entry. A pending entry resumes the server's request instead of starting a new one, so a query never runs twice.
6. **The request ends.** The server's client is cleared and dropped.

## Server clients

A client on the server behaves differently, because it renders once:

| Behavior            | Browser                     | Server                                             |
| ------------------- | --------------------------- | -------------------------------------------------- |
| Retries             | 3 by default                | None by default                                    |
| `gcTime`            | 5 minutes by default        | `Infinity`: the cache lives as long as the request |
| Stale cached data   | Refetched in the background | Reused, unless marked by `invalidate`              |
| Focus and reconnect | Refetch read, stale queries | Not watched                                        |

So in a server render, `ensure` and `fetch` wait for the same thing, and each query makes at most one request whatever its `staleTime`.

## Errors

Only entries with data or a request in flight are sent. A query that had already failed when its entry would have been sent stays on the server, and the browser fetches it again when something reads it.

A query sent while pending, that then fails on the server, rejects in the browser. By default it rejects with a `RedactedError` that names the query but not the message, so server internals (SQL errors, stack traces) don't leak into the page. The browser treats it like any failed load: the reader throws to its error boundary, and resetting the boundary refetches the query from the browser. Pass `keepErrors: true` in the integration's `dehydrateOptions` to send the original error instead.

## Browser-only queries

Some data only the browser can know: a push subscription, a notification permission, a service worker, a media query. That still belongs in the cache — same factory, same handle, same invalidation — just mark the query `ssr: false` so the server never runs it:

```ts twoslash
import { queryOptions } from "@raf-query/react";
declare function detectPushState(channel: string): Promise<"on" | "off">;
// ---cut---
export function pushStateQuery(input: { channel: string }) {
	return queryOptions({
		queryKey: ["pushState", input.channel],
		queryFn: () => detectPushState(input.channel),
		ssr: false,
	});
}
```

A server client never starts it and never sends it. Loaders and components still use it like any query: `prefetch` returns a handle on the server too, and the browser starts the request when the loader or the first read runs there. On the server, readers see it pending:

```tsx twoslash
import { useQuery } from "@raf-query/react";
import { queryOptions } from "@raf-query/react";
import { use, type ReactNode } from "react";
declare function detectPushState(channel: string): Promise<"on" | "off">;
function pushStateQuery(input: { channel: string }) {
	return queryOptions({
		queryKey: ["pushState", input.channel],
		queryFn: () => detectPushState(input.channel),
		ssr: false,
	});
}
declare const loaderData: {
	push: import("@raf-query/react").QueryHandle<typeof pushStateQuery>;
};
declare function PushSwitch(props: {
	readonly state: "on" | "off" | "unknown";
}): ReactNode;
// ---cut---
function PushState() {
	const [pushPromise, push] = useQuery(pushStateQuery, loaderData.push);
	if (push.isPending) {
		return <PushSwitch state="unknown" />;
	}
	return <PushSwitch state={use(pushPromise)} />;
}
```

The browser hydrates the same pending state, then renders the result. A reader that calls `use()` on the promise instead needs a Suspense boundary: on the server the promise rejects with `Query.BrowserOnlyError`, so React sends the fallback and renders the boundary in the browser. React reports that boundary to `onRecoverableError` while hydrating.

`ensure` and `fetch` can't wait for it on the server, so they fail with `Query.BrowserOnlyError`. Use `prefetch` in loaders that also run on the server. `invalidate`, `reset`, `refetch` and the paging controls do nothing there.

## When the browser already has data

On client-side navigations in Next.js, server components render again and send their cache entries with the RSC payload, while the browser may already have the same entries. The browser takes whichever copy is newer, by when it was fetched (`updatedAt`; server and browser clocks should agree):

- No data, no request of its own: it resumes the server's pending request.
- Data, or its own request in flight: it waits for the server's copy and takes it if newer.
- If it keeps its own copy (the server's is older, as in a payload the router replays from its cache on back and forward, or the server's request failed), it refetches it if stale.

## Serialization

Data, keys, inputs and `meta` cross the wire, so they must be serializable by the framework's serializer. TanStack Start uses [Seroval](https://github.com/lxsmnsyc/seroval), and Next.js uses React's RSC serialization: both handle `Date`, `Map`, `Set`, `BigInt` and promises. The integration's `serializeData` and `deserializeData` options transform data on the way, for anything else.

Only send what's serializable. These docs, for instance, cache each demo's code module as a query, and a module full of components can't cross the wire. The router integration's `filter` option keeps those entries out of the stream. A `filter` replaces the default one, `canDehydrate` (entries with data or a request in flight), so combine the two:

```ts twoslash
import { canDehydrate, QueryClient } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
declare const queryClient: QueryClient;
declare const router: Parameters<typeof setupRouterIntegration>[0]["router"];
// ---cut---
setupRouterIntegration({
	dehydrateOptions: {
		filter: (query) => query.key[0] === "doc" && canDehydrate(query),
	},
	queryClient,
	router,
});
```

## Framework guides

- [TanStack Start](./tanstack-start.md): `setupRouterIntegration` streams the router's query client.
- [Next.js App Router](./nextjs.md): `QueryProvider` and `HydrationBoundary` for React Server Components.
