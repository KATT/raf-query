---
title: Query factories
description: Define each query once as a factory of one serializable input, shared by loaders, server components and components.
section: Guides
order: 4
---

A query is a **factory**: a function of zero or one argument that returns `queryOptions(...)` or `infiniteQueryOptions(...)`. The loader and the component call the same factory, so data types flow end to end.

```ts title="src/queries.ts"
import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: ["comments", input.slug],
		queryFn: (context) =>
			listComments({ slug: input.slug, cursor: context.pageParam }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
```

## One input, serializable

Factories take **at most one argument**; the type rejects two or more. That argument is the query's **input**, and it must be serializable, because it's what a [handle](./handles.md) carries from the loader (or the server) to the component.

Use an object even for one field (`{ slug }`, `{ id }`): it reads well at call sites and leaves room to grow.

```ts
qc.prefetch(postQuery, { slug: "hello-world" });
qc.prefetch(issuesQuery); // a factory without input
```

## The factory decides everything

The factory is the only place a query is declared, including whether it's paged. Every other API — `prefetch`, `ensure`, `fetch`, `useQuery`, `useWaterfall`, `invalidate`, `setData` — takes either kind and infers the rest from the factory's type: the data, the input, and for paged queries the page and page param types.

Options set in the factory override the client's `config.defaults`:

| Option                                       | What it does                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `queryKey`                                   | The cache key; include the input. See [Query keys](./query-keys.md)                    |
| `queryFn`                                    | Loads the data. See [Query functions](./query-functions.md)                            |
| `staleTime`                                  | How long data counts as fresh, in ms                                                   |
| `gcTime`                                     | How long an unread entry stays cached, in ms                                           |
| `retry`, `retryDelay`                        | See [Retries](./retries.md)                                                            |
| `refetchOnWindowFocus`, `refetchOnReconnect` | See [Window focus refetching](./window-focus-refetching.md)                            |
| `structuralSharing`                          | See [Render optimizations](./render-optimizations.md)                                  |
| `meta`                                       | Anything you want to know about the query elsewhere. See [Query meta](./query-meta.md) |

`infiniteQueryOptions` also takes `initialPageParam`, `getNextPageParam`, `getPreviousPageParam` and `maxPages`. See [Infinite queries](./infinite-queries.md).

## Type inference

TypeScript infers the data type from `queryFn`. For paged queries it infers the page type from `queryFn` too, which means `queryFn` must come before `getNextPageParam` in the object literal. If your lint setup sorts keys, pass the types instead:

```ts
infiniteQueryOptions<CommentPage, number>({
	getNextPageParam: (lastPage) => lastPage.nextCursor,
	initialPageParam: 0,
	queryFn: (context) => listComments({ cursor: context.pageParam }),
	queryKey: ["comments"],
});
```

To name a factory's types elsewhere:

```ts
import type { DataOf, InputOf, QueryHandle } from "@raf-query/react";

type Post = DataOf<typeof postQuery>; // what queryFn resolves to
type PostInput = InputOf<typeof postQuery>; // { slug: string }
type PostHandle = QueryHandle<typeof postQuery>; // for props
```

## Server-only factories

A factory whose `queryFn` imports server-only code (a database client) can't be imported by a client component, so it can't be read with `useQuery` in the browser. Render its data in a server component, or call the database through a server function or an API route so the browser can refetch it. See [React Server Components](./nextjs.md#server-only-queries).
