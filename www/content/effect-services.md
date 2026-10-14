---
title: Services
description: Effect queryFns can require services. They become part of the factory's type, and QueryClient provides them from a layer.
section: Effect
order: 2
---

A `queryFn`'s Effect can require services. They're part of the factory's type, `ServicesOf<TFactory>`, and every verb that can start the query requires them:

```ts
import { QueryCache, queryOptions } from "@raf-query/core";
import { Context, Effect, Layer } from "effect";

class IssueApi extends Context.Service<
	IssueApi,
	{ readonly get: (id: number) => Effect.Effect<Issue, IssueNotFound> }
>()("app/IssueApi") {}

const IssueApiLive = Layer.succeed(IssueApi, { get: IssueRepo.get });

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () =>
			Effect.gen(function* () {
				const api = yield* IssueApi;
				return yield* api.get(input.id);
			}),
	});
}

// Effect<Issue, IssueNotFound | Query.CancelledError, QueryCache | IssueApi>
const issue = QueryCache.QueryCache.use((cache) =>
	cache.fetch(issueQuery, { id: 1 }),
);

Effect.runFork(
	issue.pipe(Effect.provide(QueryCache.layer()), Effect.provide(IssueApiLive)),
);
```

## Which services a request runs with

- On `QueryCache`, `ensure`, `fetch`, `prefetch`, `getQuery` and `watch` require the factory's services, and so does `Query.fetch`.
- A request runs with the services the cache was built with, under those of the latest of these calls for its entry.
- Requests that start without a caller (a render's read, `refetch`, polling, focus and reconnect, `invalidate`) reuse the entry's last services.
- The caller's `Scope` isn't passed on: a request outlives the call that started it. Scope a `queryFn`'s resources with `Effect.scoped`.

## Tracing

Each request runs in a `raf-query.request` span with a `raf_query.hash` attribute, under the latest caller's span if it had one. Defects are logged with `Effect.logError`; typed failures are the query's error.

## Services in QueryClient

`QueryClient` gets its services from a `layer`. It's built into the client's scope along with the cache, so it must build synchronously:

```ts
const queryClient = new QueryClient({ layer: IssueApiLive }); // QueryClient<IssueApi>
const handle = queryClient.prefetch(issueQuery, { id: 1 });

await queryClient.dispose();
```

The client's type is `QueryClient<TServices>`, and its verbs accept only factories whose services the layer provides. Any other factory is a type error. `dispose()` interrupts every request and runs the layer's finalizers.

### In React

`QueryClientProvider` takes a client with any services. A hook can't know which ones, so `useQueryClient()` returns a `QueryClient<unknown>`, whose verbs accept any factory, and `useQuery` reads any factory. A request then fails with a defect if the client's layer lacks a service it needs.

In TanStack Start, type the router context with the client's services, so loaders keep the check:

```ts
createRootRouteWithContext<{ queryClient: QueryClient<IssueApi> }>();
```
