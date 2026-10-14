---
title: Next.js App Router
description: Start queries in React Server Components, send them to client components with HydrationBoundary, and refetch from the browser.
section: Server rendering
order: 3
---

In the App Router, server components play the part of loaders: they start queries and pass handles to client components. `@raf-query/react/rsc` provides the two pieces that connect them.

## Setup

A query client per request for server components, scoped by React's `cache()`:

```ts title="src/query-client.ts"
import { QueryClient, type QueryClientConfig } from "@raf-query/react";
import { cache } from "react";

export const queryClientConfig = {
	defaults: { staleTime: 5000 },
} as const satisfies QueryClientConfig;

export const getQueryClient = cache(() => new QueryClient(queryClientConfig));
```

`QueryProvider` in the root layout, for client components:

```tsx title="src/app/layout.tsx"
import { QueryDevtools } from "@raf-query/react/devtools";
import { QueryProvider } from "@raf-query/react/rsc";

import { queryClientConfig } from "~/query-client.ts";

export default function RootLayout(props: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<QueryProvider config={queryClientConfig}>
					{props.children}
					{process.env.NODE_ENV !== "production" ? <QueryDevtools /> : null}
				</QueryProvider>
			</body>
		</html>
	);
}
```

`QueryProvider` creates one client per server render and one per browser tab. Its `config` must be serializable, since it crosses from the server component layout to the client.

Omit `<QueryDevtools />` in production so bundlers drop the panel. The [example app](./examples.md) always renders it, so the panel stays available in the deployed demo.

## Pages

A server component starts queries, and wraps what it renders in a `HydrationBoundary` that sends the request client's entries to the browser:

```tsx title="src/app/posts/[slug]/page.tsx"
import { HydrationBoundary } from "@raf-query/react/rsc";

export default async function Page(props: {
	params: Promise<{ slug: string }>;
}) {
	const params = await props.params;
	const qc = getQueryClient();

	const comments = qc.prefetch(commentsQuery, { slug: params.slug });
	const post = await qc.fetch(postQuery, { slug: params.slug });

	return (
		<HydrationBoundary client={qc}>
			<article>
				<h1>{post.title}</h1>
				<Suspense fallback={<CommentsSkeleton />}>
					<Comments handle={comments} />
				</Suspense>
			</article>
		</HydrationBoundary>
	);
}
```

```tsx title="src/components/comments.tsx"
"use client";

export function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [commentsPromise] = useQuery(commentsQuery, props.handle);
	// ...
}
```

- Render a `HydrationBoundary` in each server component that starts queries for client components. Entries already sent in this request are skipped, so nesting them is fine.
- Pending entries stream as promises through the RSC payload: the page's shell renders while `comments` loads.
- `fetch` and `ensure` wait for the same thing on the server. `await qc.fetch(...)` the data the server component renders itself. When it also hands the query to a client component, pass `await qc.ensure(...)`, so the client component gets the data from `useQuery` without a promise.

## Search params

Read `searchParams` in the page, validate them, and pass them as the input:

```tsx
export default async function IssuesPage(props: {
	searchParams: Promise<Record<string, string | string[]>>;
}) {
	const input = IssueListInput.parse(await props.searchParams);
	const qc = getQueryClient();
	const issues = qc.prefetch(issueListQuery, input);
	// ...
}
```

Changing search params with `<Link>` or `router.push` renders the page again on the server with the new input. See [URL state and pagination](./url-state-and-pagination.md) for what to show while it loads.

## Queries that start in the browser

`QueryProvider`'s server render starts no requests. A client component reading a query that no `HydrationBoundary` sent renders its Suspense fallback on the server, and the query loads in the browser. This is what happens with [`useWaterfall`](./request-waterfalls.md#render-time-inputs-usewaterfall) in a client component. That boundary renders in the browser through React's error recovery, with the digest Next.js uses for `ssr: false`, so Next.js doesn't report it.

## Server actions and route handlers

Factories can call server actions: server components call them directly, and the browser calls them on refetch. Validate their arguments, since anyone can call them.

The browser runs a page's server actions one at a time, so refetches wait for each other and for any pending mutation. For parallel requests, have the `queryFn` call a [Route Handler](https://nextjs.org/docs/app/api-reference/file-conventions/route) instead, as [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) does:

```ts
export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: (context) =>
			fetch(`/api/issues/${input.id}`, { signal: context.signal }).then(
				(response) => response.json(),
			),
	});
}
```

## Mutations

Write with a server action, then invalidate in the browser:

```tsx
<form
	action={async (formData) => {
		await updateIssue(formData);
		await qc.invalidate(issueQuery, { id });
	}}
>
```

If the action also calls `revalidatePath` or `refresh()`, server components render again and send their entries, and the browser keeps whichever copy is newest.

## Server-only queries

A factory that imports server-only code (a database client) can't be imported by a client component, so it can't be read with `useQuery`. Render its data in a server component, or pass a plain promise prop and `use()` it on the client. Refresh it with `router.refresh()`.

## Example

[`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) is the same issue tracker as the TanStack Start example, so the two integrations can be compared side by side.
