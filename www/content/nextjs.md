---
title: Next.js App Router
description: Start queries in React Server Components, send them to client components with HydrationBoundary, and refetch from the browser.
section: Server rendering
order: 3
---

In the App Router, server components play the part of loaders: they start queries and pass handles to client components. `QueryProvider` and `HydrationBoundary`, both from `@raf-query/react`, connect them.

## Setup

A query client per request for server components, scoped by React's `cache()`:

```sample
nextjs/src/query-client.ts
```

`QueryProvider` in the root layout, for client components:

```sample
nextjs/src/app/layout.tsx
```

`QueryProvider` creates one client per server render and one per browser tab. Its `config` must be serializable, since it crosses from the server component layout to the client.

Mount DevTools only when `process.env.NODE_ENV !== "production"` so Next.js drops the panel from production builds. The [example app](./examples.md) always renders it, so the panel stays available in the deployed demo.

## Pages

A server component starts queries, and wraps what it renders in a `HydrationBoundary` that sends the request client's entries to the browser:

```sample
nextjs/src/app/(blog)/posts/[slug]/page.tsx
```

```sample
nextjs/src/app/(blog)/components/post.tsx#component
```

```sample
nextjs/src/app/(blog)/components/comments.tsx#component
```

- Render a `HydrationBoundary` in each server component that starts queries for client components. Entries already sent in this request are skipped, so nesting them is fine.
- `client` works only in server components. Next.js resolves `@raf-query/react` with the `react-server` export condition there, which picks the `HydrationBoundary` that dehydrates the client. Client components get the one that takes a dehydrated `state`, as in [React Router](./react-router.md).
- Pending entries stream as promises through the RSC payload: the page's shell renders while `comments` loads.
- `await qc.fetch(...)` (or `ensure`, which waits for the same thing on the server) returns a handle with the `data`: render `post.data` in the server component, and pass `post` to client components that read the query: typed `QueryHandleWithData`, they get the data from `useQuery` without a promise. The data crosses once: the RSC payload references the `HydrationBoundary`'s copy.

## Pending UI

While a link navigation is loading the next RSC payload, show pending state with Next.js — not [`useIsFetching`](./background-fetching-indicators.md#useisfetching). Render [`useLinkStatus`](https://nextjs.org/docs/app/api-reference/functions/use-link-status) as a child of the `Link` it tracks:

```sample
nextjs/src/docs/nextjs.tsx#pending-ui
```

Per-query background refetches after the page has rendered use `controls.isFetching`. See [Background fetching indicators](./background-fetching-indicators.md).

## Search params

Read `searchParams` in the page, validate them, and pass them as the input:

```sample
nextjs/src/app/issues/page.tsx#page
```

Changing search params with `<Link>` or `router.push` renders the page again on the server with the new input. See [URL state and pagination](./url-state-and-pagination.md) for what to show while it loads.

## Queries that start in the browser

`QueryProvider`'s server render starts no requests. A client component reading a query that no `HydrationBoundary` sent renders its Suspense fallback on the server, and the query loads in the browser. This is what happens with [`useWaterfall`](./request-waterfalls.md#render-time-inputs-usewaterfall) in a client component. That boundary renders in the browser through React's error recovery, with the digest Next.js uses for `ssr: false`, so Next.js doesn't report it.

## Server and browser requests

A factory's `queryFn` runs in two places, and has to reach the same data as the same user in both:

|                     | Server components                            | Browser                   |
| ------------------- | -------------------------------------------- | ------------------------- |
| When                | The page request                             | Refetches and later pages |
| `fetch("/api/...")` | Fails: there is no page origin to resolve it | Works                     |
| The user's cookies  | Yours to forward, from `headers()`           | Sent by the browser       |

Client components' server render starts no request, so it isn't a third place.

### An API in the same app

Have the API read the session from the request's cookies, and give factories one `apiFetch` with two files behind it: on the server it calls the API's handler in the process with the page request's cookies, and in the browser it's `fetch`. A [subpath import](https://nodejs.org/api/packages.html#subpath-imports) picks the file. Next.js resolves the `react-server` condition in server components, so the server file can import `next/headers` and your API, and neither reaches the browser bundle:

```json title="package.json"
{
	"imports": {
		"#api-fetch": {
			"react-server": "./src/api-fetch.server.ts",
			"default": "./src/api-fetch.ts"
		}
	}
}
```

```sample
nextjs/src/api-fetch.server.ts
```

```sample
nextjs/src/api-fetch.ts
```

```sample
nextjs/src/queries.ts#api-fetch
```

- The API sees the same request from both sides, so it authenticates the same way. Forward only what it reads (`cookie`, `authorization`), not every header.
- Nothing needs the app's own origin, and server rendering doesn't open a second connection to itself.
- A typed client works the same way. [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) gives a Hono client the page request's cookies in `src/forwarded-headers.server.ts`.
- Reading `headers()` renders the page per request, as a page with per-user data must.

### An API on another origin

The server can call the same URL as the browser, but the browser's cookies belong to your origin, not the API's:

- **In server components**, forward the credentials it needs: read your session with `cookies()` and send, for example, an `Authorization` header.
- **In the browser**, either proxy it through a [Route Handler](https://nextjs.org/docs/app/api-reference/file-conventions/route), so the request carries your cookies and the handler adds the same credentials, or send `credentials: "include"` to an API that allows your origin with CORS and sets its own cookies.

Pick the two implementations with the same `react-server` condition.

### Server actions

Factories can call server actions, and get both sides for free: server components call the function in the page request, and the browser posts to it with its cookies. Validate their arguments, since anyone can call them.

The browser runs a page's server actions one at a time, so refetches wait for each other and for any pending mutation. For parallel requests, call your API instead.

## Mutations

Write with a server action, then invalidate in the browser:

```sample
nextjs/src/components/update-issue-form.tsx#form
```

If the action also calls `revalidatePath` or `refresh()`, server components render again and send their entries, and the browser keeps whichever copy is newest.

## Server-only queries

A factory that imports server-only code (a database client) can't be imported by a client component, so it can't be read with `useQuery`. Render its data in a server component, or pass a plain promise prop and `use()` it on the client. Refresh it with `router.refresh()`.

To read it from client components too, put the server-only code behind an API, and reach that from the factory as in [An API in the same app](#an-api-in-the-same-app).

## Example

[`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) is the same issue tracker as the TanStack Start example, so the two integrations can be compared side by side.
