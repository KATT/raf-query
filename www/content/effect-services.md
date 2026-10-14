---
title: Services
description: Effect queryFns can require services. They become part of the factory's type, and QueryClient provides them from a layer.
section: Effect
order: 2
sampleApp: tanstack-start-effect
---

A `queryFn`'s Effect can require services. They're part of the factory's type, `ServicesOf<TFactory>`, and every verb that can start the query requires them:

```ts twoslash
import { QueryCache, queryOptions } from "@raf-query/core";
import { Context, Effect, Layer } from "effect";
import type { Issue, IssueNotFound } from "~/issues.ts";
declare const IssueRepo: {
	get(id: number): Effect.Effect<Issue, IssueNotFound>;
};
// ---cut---
class IssueApi extends Context.Service<
	IssueApi,
	{ readonly get: (id: number) => Effect.Effect<Issue, IssueNotFound> }
>()("app/IssueApi") {}

const IssueApiLive = Layer.succeed(IssueApi, { get: IssueRepo.get });

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueApi.use((api) => api.get(input.id)),
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

```ts twoslash
import { QueryClient } from "@raf-query/react";
import { IssueApiLive } from "~/issues.ts";
import { issueQuery } from "~/queries.ts";
// ---cut---
const queryClient = new QueryClient({ layer: IssueApiLive }); // QueryClient<IssueApi>
const handle = queryClient.prefetch(issueQuery, { id: 1 });

await queryClient.dispose();
```

The client's type is `QueryClient<TServices>`, and its verbs accept only factories whose services the layer provides. Any other factory is a type error. `dispose()` interrupts every request and runs the layer's finalizers.

`queryClient.runPromise(effect)` runs an app's own Effect (a loader, a form action) with the cache and the layer's services, so it can `yield*` both:

```ts twoslash
import { QueryCache, QueryClient } from "@raf-query/react";
import { Effect } from "effect";
import { IssueApi, IssueApiLive } from "~/issues.ts";
const queryClient = new QueryClient({ layer: IssueApiLive });
// ---cut---
await queryClient.runPromise(
	Effect.gen(function* () {
		const api = yield* IssueApi;
		const cache = yield* QueryCache.QueryCache;
		yield* api.rename({ id: 1, title: "Renamed" });
		yield* cache.invalidate({ queryKey: ["issue", 1] });
	}),
);
```

Like `Effect.runPromise`, it rejects with the Effect's failure or defect. An Effect that needs a service the layer doesn't provide is a type error. [Typed errors](./effect-errors.md) covers catching the failures first.

### In React

`QueryClientProvider` takes a client with any services. A hook can't know which ones, so `useQueryClient()` returns a `QueryClient<unknown>`, whose verbs accept any factory and any Effect. A request then fails with a defect if the client's layer lacks a service it needs.

Components rarely need the services anyway. `useQuery` reads what a loader started, and the cache runs every request with the layer's services: the loader's, a render's, a refetch, an invalidation. So keep the check where Effects start: type the router context with the client's services, and loaders and actions get the typed client from it.

<<< ../samples/tanstack-start-effect/src/routes/__root.tsx

Loaders start queries through the typed client, so a factory that needs a service the layer doesn't provide is a type error there. Components read the handles with `useQuery`, which needs no services:

```tsx twoslash title="src/routes/issues.$issueId.tsx"
// @filename: tanstack-start-effect/src/routes/issues.$issueId.tsx
import { type QueryHandle, useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";
import { issueQuery } from "~/queries.ts";
// ---cut---
export const Route = createFileRoute("/issues/$issueId")({
	loader: (args) => {
		const qc = args.context.queryClient;
		//    ^?
		return {
			issue: qc.prefetch(issueQuery, { id: Number(args.params.issueId) }),
		};
	},
	component: IssuePage,
});

function IssuePage() {
	const loaderData = Route.useLoaderData();
	return (
		<Suspense fallback={<p>Loading…</p>}>
			<IssueTitle handle={loaderData.issue} />
		</Suspense>
	);
}

function IssueTitle(props: { handle: QueryHandle<typeof issueQuery> }) {
	const [issuePromise] = useQuery(issueQuery, props.handle, {
		throwOnError: true,
	});
	return <h1>{use(issuePromise).title}</h1>;
}
```

A component that starts an Effect itself, like a form action, gets the client from the route's context too, so `runPromise` keeps the check:

```tsx twoslash title="src/components/rename-form.tsx"
import { getRouteApi } from "@tanstack/react-router";
import { Effect } from "effect";
import { type Issue, IssueApi } from "~/issues.ts";
const Route = getRouteApi("/issues/$issueId");
// ---cut---
export function RenameForm(props: { issue: Issue }) {
	const queryClient = Route.useRouteContext().queryClient; // not useQueryClient()
	return (
		<form
			action={(formData) =>
				queryClient.runPromise(
					IssueApi.use((api) =>
						api.rename({
							id: props.issue.id,
							title: String(formData.get("title")),
						}),
					).pipe(Effect.ignore),
				)
			}
		>
			<input defaultValue={props.issue.title} name="title" />
		</form>
	);
}
```

[Using Effect](./effect.md#the-whole-picture) has the whole app: service, queries, client, loader, components and action.
