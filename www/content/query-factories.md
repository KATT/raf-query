---
title: Query factories
description: Define each query once as a factory of one serializable input, shared by loaders, server components and components.
section: Guides
order: 4
---

A query is a **factory**: a function of zero or one argument that returns `queryOptions(...)` or `infiniteQueryOptions(...)`. The loader and the component call the same factory, so data types flow end to end.

<<< ./query-factories/src/queries.ts [src/queries.ts]

## One input, serializable

Factories take **at most one argument**; the type rejects two or more. That argument is the query's **input**, and it must be serializable, because it's what a [handle](./handles.md) carries from the loader (or the server) to the component.

Use an object even for one field (`{ slug }`, `{ id }`): it reads well at call sites and leaves room to grow.

<<< ./query-factories/src/prefetch.ts#prefetch

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

<<< ./query-factories/src/inference.ts#inference

The options' types take a bag of named types rather than a list of type arguments. `error` and `services` are only for [Effect](./effect.md) `queryFn`s, and default to `unknown` and `never`:

<<< ./query-factories/src/option-types.ts#options

To name a factory's types elsewhere:

<<< ./query-factories/src/type-helpers.ts#types

## Factory makers

A library can wrap a typed API in a function that returns a factory, generic over the endpoint. Call it inline, wherever a factory goes; the types flow from the endpoint:

<<< ./query-factories/src/factory-makers.ts#makers

Each call returns a new function, but entries are found by `queryKey`, so every call for the same endpoint and args reaches the same entry. Put everything the key depends on in it.

## Server-only factories

A factory whose `queryFn` imports server-only code (a database client) can't be imported by a client component, so it can't be read with `useQuery` in the browser. Render its data in a server component, or call the database through a server function or an API route so the browser can refetch it. See [React Server Components](./nextjs.md#server-only-queries).
