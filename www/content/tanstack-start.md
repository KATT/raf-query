---
title: TanStack Start
description: Set up raf-query with TanStack Router and Start, start queries in loaders, stream them during SSR and handle redirects.
section: Server rendering
order: 2
---

TanStack Router's loaders are where raf-query wants queries to start, and its SSR streaming is what carries the cache to the browser. The integration is one function call.

## Setup

```tsx twoslash title="src/router.tsx"
import type { ReactNode } from "react";
declare module "./routeTree.gen.ts" {
	export const routeTree: unknown;
}
declare namespace ImportMeta {
	readonly env: { readonly DEV: boolean };
}
// ---cut---
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
	const queryClient = new QueryClient({ defaults: { staleTime: 5000 } });
	const router = createRouter({
		context: { queryClient },
		defaultPreload: "intent",
		// The query cache decides what's fresh; loaders always run and dedupe there.
		defaultPreloadStaleTime: 0,
		routeTree,
		scrollRestoration: true,
		Wrap: (props: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
				{import.meta.env.DEV ? <QueryDevtools /> : null}
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({ queryClient, router });
	return router;
}
```

Mount DevTools only when `import.meta.env.DEV` is true so Vite drops the panel from production builds. The [example app](./examples.md) always renders it, so the panel stays available in the deployed demo.

Type the router context in the root route, so loaders see `queryClient`:

```tsx twoslash title="src/routes/__root.tsx"
import type { QueryClient } from "@raf-query/react";
import { createRootRouteWithContext } from "@tanstack/react-router";
// ---cut---
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		// ...
	},
);
```

`getRouter` runs once per request on the server and once in the browser, so each request gets its own client and the browser keeps one for the session.

## What the integration does

`setupRouterIntegration`:

- **Streams queries during SSR.** Entries go to the browser as they settle, through the router's own stream. Pending queries cross as promises.
- **Clears the request's cache** when the response finishes.
- **Turns `redirect()` thrown from a `queryFn` into a navigation**, wherever the query failed: a loader, a render or a background refetch in the browser.

Options:

| Option             | Use                                                            |
| ------------------ | -------------------------------------------------------------- |
| `dehydrateOptions` | `filter` which entries are sent, `keepErrors`, `serializeData` |
| `hydrateOptions`   | `deserializeData`, the counterpart of `serializeData`          |
| `handleRedirects`  | `false` to handle redirects yourself                           |

## Loaders

A loader starts every query its route needs and returns the handles:

```tsx twoslash title="src/routes/posts.$slug.tsx"
import { useQuery } from "@raf-query/react";
import { commentsQuery, createFileRoute, postQuery } from "./_twoslash.ts";
// ---cut---
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const comments = qc.prefetch(commentsQuery, { slug: args.params.slug });
		const post = await qc.ensure(postQuery, { slug: args.params.slug });
		return { comments, post };
	},
	component: PostPage,
});

function PostPage() {
	const loaderData = Route.useLoaderData();
	const [post] = useQuery(postQuery, loaderData.post);
	// ...
}
```

See [Starting queries](./starting-queries.md) for choosing between `prefetch` and `ensure`.

### Handles in route context

`beforeLoad` can return handles too. They're part of the route context, so child routes' loaders and components read them, and the router serializes them to the browser with the rest of the context:

```tsx twoslash title="src/routes/_auth.tsx"
import { queryOptions, useQuery } from "@raf-query/react";
import { createFileRoute } from "./_twoslash.ts";
declare function redirect(opts: { to: string }): never;
function meQuery() {
	return queryOptions({
		queryKey: ["me"],
		queryFn: async () => ({ id: "1", name: "Ada" }),
	});
}
// ---cut---
export const Route = createFileRoute("/_auth")({
	beforeLoad: async (args) => {
		const qc = args.context.queryClient;
		const me = await qc.ensure(meQuery);
		if (!qc.getData(meQuery)) {
			throw redirect({ to: "/login" });
		}
		return { me };
	},
});

// In a child route
function Dashboard() {
	const context = Route.useRouteContext();
	const [me] = useQuery(meQuery, context.me);
	// ...
}
```

Importing `@raf-query/react/tanstack-router` registers handles as serializable, so Start's type check of `beforeLoad`'s return accepts them.

### Router settings

- **`defaultPreload: "intent"`** runs a route's loader when the user hovers or focuses a link, so the queries start before the click.
- **`defaultPreloadStaleTime: 0`** makes the router run the loader again on click. Otherwise it reuses a hover's preload for 30 seconds, and the query cache never hears about the navigation. The query cache dedupes, so running the loader again is free when the data is fresh.
- **`pendingComponent` and `pendingMs`** show a full-page skeleton for routes whose loader `ensure`s slow data.

### Search params

Use `loaderDeps` to pass validated search params to the loader, so it reruns when they change. See [URL state and pagination](./url-state-and-pagination.md).

## Server functions

Factories can call server functions (`createServerFn`) directly. The loader runs on the server during SSR, where the call is a function call; in the browser, refetches call the same function over HTTP.

```ts twoslash title="src/queries.ts"
import { queryOptions } from "@raf-query/react";
declare module "./posts.functions.ts" {
	export function getPost(args: {
		data: { slug: string };
	}): Promise<{ slug: string; title: string }>;
}
// ---cut---
import { getPost } from "./posts.functions.ts";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost({ data: input }),
	});
}
```

## Static prerendering

These docs are a TanStack Start app, prerendered to static HTML. Every page's loader `ensure`s its content during the build, the content crosses in the page's HTML, and later navigations load it in the browser. See the [source](https://github.com/KATT/raf-query/tree/main/docs).

## Example

[`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) is a complete issue tracker: lists with filters and infinite scroll, details with comments, and mutations with optimistic updates.
