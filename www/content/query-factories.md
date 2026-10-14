---
title: Query factories
description: Define each query once as a factory of one serializable input, shared by loaders, server components and components.
section: Guides
order: 4
---

A query is a **factory**: a function of zero or one argument that returns `queryOptions(...)` or `infiniteQueryOptions(...)`. The loader and the component call the same factory, so data types flow end to end.

```ts twoslash title="src/queries.ts"
import { getPost, listComments } from "./_twoslash.ts";
// ---cut---
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

```ts twoslash
import { QueryClient, queryOptions } from "@raf-query/react";
import { postQuery } from "./_twoslash.ts";
const qc = new QueryClient();
function issuesQuery() {
	return queryOptions({ queryKey: ["issues"], queryFn: async () => [] });
}
// ---cut---
qc.prefetch(postQuery, { slug: "hello-world" });
qc.prefetch(issuesQuery); // a factory without input
```

A factory with two parameters doesn't type-check where it's used:

```ts twoslash
// @errors: 2345
import { QueryClient, queryOptions } from "@raf-query/react";
import { getPost } from "./_twoslash.ts";
const qc = new QueryClient();
// ---cut---
function postPageQuery(slug: string, page: number) {
	return queryOptions({
		queryKey: ["post", slug, page],
		queryFn: () => getPost(slug),
	});
}

qc.prefetch(postPageQuery, "hello-world");
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

TypeScript infers the data type from `queryFn`. For paged queries it infers the page type from `queryFn` too, which means `queryFn` must come before `getNextPageParam` in the object literal. If your lint setup sorts keys, annotate the page instead:

```ts twoslash
import { infiniteQueryOptions } from "@raf-query/react";
import { type CommentPage, listComments } from "./_twoslash.ts";
// ---cut---
const commentsOptions = infiniteQueryOptions({
	getNextPageParam: (lastPage: CommentPage) => lastPage.nextCursor,
	initialPageParam: 0,
	queryFn: (context) =>
		listComments({ cursor: context.pageParam, slug: "hello-world" }),
	queryKey: ["comments", "hello-world"],
});
commentsOptions;
// ^?
```

The options' types take a bag of named types rather than a list of type arguments. `error` and `services` are only for [Effect](./effect.md) `queryFn`s, and default to `unknown` and `never`:

```ts twoslash
import {
	type CommentPage,
	commentsQuery,
	type Post,
	postQuery,
} from "./_twoslash.ts";
// ---cut---
import type { InfiniteQueryOptions, QueryOptions } from "@raf-query/react";

const post: QueryOptions<{ data: Post }> = postQuery({ slug: "hello-world" });
const comments: InfiniteQueryOptions<{ page: CommentPage; pageParam: number }> =
	commentsQuery({ slug: "hello-world" });
```

To name a factory's types elsewhere:

```ts twoslash
import { postQuery } from "./_twoslash.ts";
// ---cut---
import type { DataOf, InputOf, QueryHandle } from "@raf-query/react";

type PostData = DataOf<typeof postQuery>; // what queryFn resolves to
//   ^?
type PostInput = InputOf<typeof postQuery>;
//   ^?
type PostHandle = QueryHandle<typeof postQuery>; // for props
```

## Factory makers

A library can wrap a typed API in a function that returns a factory, generic over the endpoint. Call it inline, wherever a factory goes; the types flow from the endpoint:

```ts
function endpointQuery<TArgs, TData>(endpoint: Endpoint<TArgs, TData>) {
	return (args: TArgs) =>
		queryOptions({
			queryKey: [endpoint.name, args],
			queryFn: (): Promise<TData> => call(endpoint, args),
		});
}

const post = await qc.ensure(endpointQuery(api.posts.get), { slug });
const [data] = useQuery(endpointQuery(api.posts.get), post);
```

Each call returns a new function, but entries are found by `queryKey`, so every call for the same endpoint and args reaches the same entry. Put everything the key depends on in it.

## Server-only factories

A factory whose `queryFn` imports server-only code (a database client) can't be imported by a client component, so it can't be read with `useQuery` in the browser. Render its data in a server component, or call the database through a server function or an API route so the browser can refetch it. See [React Server Components](./nextjs.md#server-only-queries).
