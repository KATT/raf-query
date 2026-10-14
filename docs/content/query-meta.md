---
title: Query meta
description: Attach information to queries with meta, read it in the queryFn, error handlers and devtools, and type it for the whole app.
section: Guides
order: 20
---

`meta` attaches anything you want to know about a query elsewhere. It reaches:

- the `queryFn`, as `context.meta`
- `Query.metaUnsafe(query)`, from the latest factory call for the entry, wherever you get a `Query` (`onError`, filters, `getAll()`)
- the devtools, in the entry's details

A common use is a per-query message for one global error handler:

```ts
import { Query, QueryClient, queryOptions } from "@raf-query/react";

export function issuesQuery() {
	return queryOptions({
		queryKey: ["issues"],
		queryFn: () => listIssues(),
		meta: { errorMessage: "Couldn't load issues" },
	});
}

const queryClient = new QueryClient({
	onError: (error, query) => {
		toast.error(
			Query.metaUnsafe(query)?.errorMessage ?? "Something went wrong",
		);
	},
});
```

## Typing meta

`meta` is `Record<string, unknown>` by default. Type it for the whole app by augmenting `Register` in the package you import from (`@raf-query/react` re-exports it from `@raf-query/core`, so either works):

```ts
declare module "@raf-query/react" {
	interface Register {
		queryMeta: { errorMessage?: string };
	}
}
```

Every `meta` is then checked against that type, and `Query.metaUnsafe` returns it.

## Defaults

`config.defaults` takes `meta` too, for queries that set none. A query's own `meta` replaces the default as a whole; the two aren't merged.

```ts
const queryClient = new QueryClient({
	defaults: { meta: { errorMessage: "Something went wrong" } },
});
```

## Selecting queries by meta

Filters receive the `Query`, so `meta` can select queries to invalidate:

```ts
await qc.invalidate({
	predicate: (query) => Query.metaUnsafe(query)?.scope === "billing",
});
```

## Serialization

`meta` is sent with dehydrated state during SSR, so keep it serializable. A hydrated entry reports the server's `meta` until the browser calls its factory.
