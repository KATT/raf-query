# @raf-query/core

The framework-agnostic engine of [raf-query](https://github.com/katt/raf-query#readme): the query cache, the verbs that start queries, handles, and the hydration primitives that move a cache from server to browser. It has no UI code. It plays the same role for raf-query that `@tanstack/query-core` plays for TanStack Query.

**Building a React app? Install [`@raf-query/react`](https://www.npmjs.com/package/@raf-query/react) instead.** It re-exports everything in this package, so apps import only from `@raf-query/react`.

Use this package directly when you:

- write bindings for another UI library,
- write an integration that streams a cache through a router or server framework, or
- use the cache from plain TypeScript or an Effect program, with no UI at all.

## Install

```shell
npm install @raf-query/core
```

[Effect](https://effect.website) is a dependency and comes with it.

## Define a query

A query is a **factory**: a function of zero or one argument that returns `queryOptions(...)` or `infiniteQueryOptions(...)`. The argument is the query's **input**. It must be serializable, because a handle carries it.

```ts
import { infiniteQueryOptions, queryOptions } from "@raf-query/core";

import { getPost, listComments } from "./api.ts";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: (context) => getPost(input.slug, context.signal),
		staleTime: 30_000,
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: ["comments", input.slug],
		queryFn: (context) => listComments(input.slug, context.pageParam),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
```

A `queryFn` returns a value, a promise, or an `Effect`. It gets the `queryKey` and an abort `signal`; paged ones also get `pageParam` and `direction`. Every other API takes the factory and infers the input and data types from it.

## The client

```ts
import { QueryClient } from "@raf-query/core";

const qc = new QueryClient({
	defaults: { staleTime: 5_000 },
	onError: (error, query) => console.error(query.hash, error),
});
```

Create one client per request on the server and one per browser tab. `isServer` is detected from `window`; server clients don't retry, never garbage-collect, and skip stale timers.

Start queries:

| Call                              | Returns                | Waits on a cache miss? |
| --------------------------------- | ---------------------- | ---------------------- |
| `qc.prefetch(factory, input)`     | `QueryHandle`          | No                     |
| `await qc.ensure(factory, input)` | `Promise<QueryHandle>` | Yes                    |
| `await qc.fetch(factory, input)`  | `Promise<Data>`        | Yes                    |

All three dedupe against the cache: fresh data is reused, and stale data resolves at once and refetches in the background. A failed `prefetch` never throws; `ensure` and `fetch` reject. For paged factories, `ensure` and `fetch` take `{ pages: n }` as a third argument to load more than the first page.

Read and write the cache:

| Call                                  | Does                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `qc.invalidate(factory, input)`       | Mark stale and refetch if read. Resolves when those refetches settle   |
| `qc.invalidate({ queryKey, exact? })` | Same, for every key that starts with `queryKey` (or equals it)         |
| `qc.setData(factory, input, updater)` | Write data; `updater` is a value or `(previous) => next`               |
| `qc.getData(factory, input)`          | Cached data, or `undefined`                                            |
| `qc.reset(...)` / `qc.remove(...)`    | Drop data so readers refetch / remove entries and abort their requests |
| `qc.clear()`                          | Drop every entry and abort every request                               |

`reset` and `remove` take a factory and input, or a filter, like `invalidate`.

## Handles

A handle is what a loader or server component passes to the code that reads a query. It holds the key and the input, and nothing else:

```ts
const handle = qc.prefetch(postQuery, { slug: "hello" });
// { key: ["post", "hello"], input: { slug: "hello" } }
```

Handles hold no data and no functions, so they serialize as-is. Data reaches the other side through the cache (see [Hydration](#hydration)). `QueryHandle<typeof postQuery>` types a handle to its factory.

## Writing a binding

A binding turns a handle into something its UI library can render. `qc.getQuery(factory, input)` returns the cache entry, a `Query`, without fetching:

```ts
const query = qc.getQuery(postQuery, handle.input);

const unsubscribe = query.subscribe(() => render(query.getState()));
const promise = query.read();
```

| `Query` member                           | Use                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `read()`                                 | The promise a render should unwrap. Starts the first request if nothing has             |
| `getState()`                             | A `QueryState` snapshot: `data`, `error`, `status`, `isFetching`, `isStale`, `promise`… |
| `subscribe(listener, observer?)`         | Listen for changes. Subscribed entries count as read, so invalidation refetches them    |
| `refetch()`, `invalidate()`              | Refetch now / mark stale, and refetch if read                                           |
| `fetchNextPage()`, `fetchPreviousPage()` | Load a page at either end of a paged query                                              |
| `hasNextPage()`, `hasPreviousPage()`     | Whether there is a page to load                                                         |
| `handle`, `key`, `hash`                  | The entry's handle, key, and stable key string                                          |

Some details bindings rely on:

- `getState()` returns a new object on every change and the same one otherwise, so it works as a snapshot for stores like React's `useSyncExternalStore`.
- `state.promise` is stable per data version. Once there is data it is already fulfilled, with `status` and `value` set the way React's `use()` reads them.
- Listeners are called in a microtask, batched, so a fetch started during render never notifies synchronously.
- A failed first load rejects the promise. Once a read has returned that rejection, a `read()` in a later task starts a new request, which is how an error boundary reset retries.
- The `observer` argument (`{ refetchOnWindowFocus, refetchOnReconnect }`) overrides the query's options for that reader. Call `qc.mount()` once the UI is live to turn on focus and reconnect refetching; it returns the matching unmount.

## Cache events

`qc.subscribe(listener)` reports every change to the cache, and returns an unsubscribe function. Integrations and devtools build on it.

```ts
const unsubscribe = qc.subscribe((event) => {
	if (event.type === "failed") {
		console.error(event.query.hash, event.error);
	}
});
```

Event types: `added`, `updated`, `observers` (a reader subscribed or left), `removed`, and `failed` (a request failed after retries, with its `error`). `qc.getAll()` lists every entry.

## Hydration

`dehydrate` snapshots a cache and `hydrate` writes the snapshot into another client. Entries still loading cross as promises, so the receiving cache resumes the sender's request instead of starting a new one.

```ts
import { dehydrate, hydrate } from "@raf-query/core";

// Server
const state = dehydrate(serverClient);

// Browser, after the state arrives through your framework's transport
hydrate(browserClient, state);
```

- `dehydrate(client, options?)` sends entries that have data or a request in flight (`canDehydrate`). Options: `filter`, `serializeData`, and `keepErrors`. By default a pending query that fails on the server rejects with a generic error on the other side, so server error messages don't leak into the page.
- `dehydrateQuery(query, options?)` snapshots one entry, for integrations that stream entries as they settle (pair it with `qc.subscribe`).
- `hydrate(client, state, options?)` only replaces data with newer data. `deserializeData` reverses `serializeData`.

The transport is up to the integration. `@raf-query/react` ships three: TanStack Router, React Server Components, and Next.js App Router.

## Effect

Requests run on Effect, and Effect code can use the client without wrapping:

- A `queryFn` can return an `Effect`. Cancelling the request interrupts it.
- `retry` takes a `Schedule` as well as a count, `boolean`, or predicate.
- `qc.effect` has Effect versions of `ensure`, `fetch` and `invalidate`, and `watch`, a `Stream` of an entry's state. `watch` counts as a reader while it runs.

```ts
import { queryOptions } from "@raf-query/core";
import { Effect, Schedule, Stream } from "effect";

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueRepo.get(input.id), // Effect<Issue, IssueNotFound>
		retry: Schedule.exponential("200 millis").pipe(Schedule.upTo({ times: 3 })),
	});
}

const program = Effect.gen(function* () {
	const issue = yield* qc.effect.fetch(issueQuery, { id: 1 });
	yield* qc.effect.watch(issueQuery, { id: 1 }).pipe(
		Stream.map((state) => state.data?.title),
		Stream.runForEach((title) => Effect.log(title)),
	);
});
```

## Exports

| Export                                                                   | Use                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `QueryClient`                                                            | The cache                                                                  |
| `queryOptions`, `infiniteQueryOptions`                                   | Typed options for a query factory / a paged one                            |
| `dehydrate`, `dehydrateQuery`, `hydrate`, `canDehydrate`                 | Move a cache between clients                                               |
| `allKeyed(record)`                                                       | Await a record of promises, keeping its keys (`Promise.allKeyed` ponyfill) |
| `hashKey(key)`, `matchesKey(key, prefix)`                                | Stable key string / prefix match                                           |
| `CancelledError`                                                         | Rejection of a request cancelled by `clear()` or `remove()`                |
| `QueryHandle`, `DataOf`, `InputOf`, `PageOf`, `IsPaged`                  | Types derived from a factory                                               |
| `Query`, `QueryState`, `CacheEvent`, `QueryFilter`, `DehydratedState`, … | Types for bindings and integrations                                        |

Query options (`staleTime`, `gcTime`, `retry`, `retryDelay`, `refetchOnWindowFocus`, `refetchOnReconnect`, and `getPreviousPageParam` / `maxPages` for paged queries) and their defaults are listed in the [main README](https://github.com/katt/raf-query#api-reference).

## Learn more

The [raf-query README](https://github.com/katt/raf-query#readme) is the full guide: loaders, reading with `use()`, paging, mutations, SSR, and the React API.

## License

MIT
