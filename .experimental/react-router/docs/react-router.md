---
title: React Router
description: Start queries in React Router Framework Mode loaders, dehydrate the cache, and hydrate it with HydrationBoundary.
section: Server rendering
order: 4
---

> Draft guide stashed with the [`.experimental/react-router`](../) experiment. Not linked from `www` yet.

React Router's loaders are where raf-query wants queries to start. There is no streaming patch of the router: the loader dehydrates the request's cache, and `HydrationBoundary` from `@raf-query/react/react-router` writes it into the browser client.

## Setup

A long-lived browser `QueryClient` in the root, wrapped in `QueryClientProvider`:

```tsx twoslash title="app/root.tsx"
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";
import { useState } from "react";
import { Outlet } from "react-router";
// ---cut---
export default function App() {
	const [queryClient] = useState(
		() => new QueryClient({ defaults: { staleTime: 5000 } }),
	);
	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
			{import.meta.env.DEV ? <QueryDevtools /> : null}
		</QueryClientProvider>
	);
}
```

Mount DevTools only when `import.meta.env.DEV` is true so Vite drops the panel from production builds. The [example app](./examples.md) always renders it, so the panel stays available in the deployed demo.

## Loaders

Each loader creates its own `QueryClient` for that request, starts every query the route needs, and returns handles plus a dehydrated snapshot:

```tsx twoslash title="app/routes/posts.$slug.tsx"
import {
	dehydrate,
	type QueryHandle,
	type QueryHandleWithData,
	QueryClient,
	useQuery,
} from "@raf-query/react";
import { use } from "react";
import { HydrationBoundary } from "@raf-query/react/react-router";
import { commentsQuery, postQuery } from "./_twoslash.ts";
// ---cut---
export async function loader(args: { params: { slug: string } }) {
	const qc = new QueryClient();
	const comments = qc.prefetch(commentsQuery, { slug: args.params.slug });
	const post = await qc.ensure(postQuery, { slug: args.params.slug });
	return {
		comments,
		dehydratedState: dehydrate(qc),
		post,
	};
}

export default function PostPage(props: {
	loaderData: {
		comments: QueryHandle<typeof commentsQuery>;
		dehydratedState: import("@raf-query/core").DehydratedState;
		post: QueryHandleWithData<typeof postQuery>;
	};
}) {
	const { comments, dehydratedState, post } = props.loaderData;
	return (
		<HydrationBoundary state={dehydratedState}>
			<Post comments={comments} post={post} />
		</HydrationBoundary>
	);
}

function Post(props: {
	comments: QueryHandle<typeof commentsQuery>;
	post: QueryHandleWithData<typeof postQuery>;
}) {
	// ensure put the post in the cache, so use() returns it without suspending.
	const [post] = useQuery(postQuery, props.post);
	return <h1>{use(post).title}</h1>;
}
```

- **`dehydrate(qc)`** captures settled and pending entries. React Router's Single Fetch can carry pending promises, so streamed `prefetch` results resume in the browser instead of refetching.
- **`HydrationBoundary`** writes that state into the provider's client before its children render.
- Create a **new `QueryClient` per loader**. A module-level client would leak data between requests.

## What the integration is

`@raf-query/react/react-router` exports a state-based `HydrationBoundary`. The cache verbs, handles and `useQuery` are the same as everywhere else. There is no `setupRouterIntegration`: React Router has no dehydrate/hydrate hooks on the router itself, so the loader returns the snapshot explicitly.

## Pending UI

While a link navigation is loading the next route, show pending state with React Router — not [`useIsFetching`](./background-fetching-indicators.md#useisfetching). [`useNavigation`](https://reactrouter.com/api/hooks/useNavigation) reports the in-flight destination, and `<Link>` accepts a `prefetch` prop (`"none"` | `"intent"` | `"render"` | `"viewport"`).

## Example

[`.experimental/react-router/app`](https://github.com/KATT/raf-query/tree/main/.experimental/react-router/app) is the same issue tracker as the TanStack Start and Next.js examples, so the three integrations can be compared side by side.
