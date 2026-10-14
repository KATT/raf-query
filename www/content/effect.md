---
title: Using Effect
description: The cache is written in Effect. Return Effects from queryFns for typed errors, services and interruption, run loaders and actions as Effects, and read the same queries from React.
section: Effect
order: 1
---

raf-query's cache is written in [Effect](https://effect.website). Using raf-query doesn't take any Effect: `queryFn`s return promises, and `QueryClient`, the hooks and the integrations speak promises. Apps that do use Effect get the same cache as Effects, with typed errors and [services](./effect-services.md).

`effect` (`^4.0.0`) is a peer dependency of both packages, so an app that uses Effect shares one copy with raf-query.

## The whole picture

An issue page on TanStack Start, from the API to the form that renames the issue. The [Effect example app](./examples.md) is the same thing, in full, with Effect RPC.

### The API: errors and a service

Failures are tagged errors, and the API is a service. Its methods say how they can fail:

```ts twoslash title="src/issues.ts"
import { Context, Effect, Schema } from "effect";
import type { Issue, User } from "./_effect.ts";
// ---cut---
export class IssueNotFound extends Schema.TaggedError<IssueNotFound>()(
	"IssueNotFound",
	{ id: Schema.Number },
) {}
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}
export class EmptyTitle extends Schema.TaggedError<EmptyTitle>()(
	"EmptyTitle",
	{},
) {}

export class IssueApi extends Context.Service<
	IssueApi,
	{
		readonly get: (
			id: number,
		) => Effect.Effect<Issue, IssueNotFound | Unauthorized>;
		readonly assignee: (
			issueId: number,
		) => Effect.Effect<User, IssueNotFound | Unauthorized>;
		readonly rename: (input: {
			readonly id: number;
			readonly title: string;
		}) => Effect.Effect<Issue, EmptyTitle | Unauthorized>;
	}
>()("app/IssueApi") {}
```

`IssueApiLive`, a `Layer<IssueApi>`, implements it: an HTTP client, an RPC client, a database.

### Queries

A `queryFn` returns an Effect that uses the service. The factory's type carries the service and the errors — `ErrorOf` and `ServicesOf` name them, and every cache verb fails or requires them:

```ts twoslash title="src/queries.ts"
import { type ErrorOf, queryOptions, type ServicesOf } from "@raf-query/react";
import { Effect, Option } from "effect";
import { IssueApi } from "./_effect.ts";
// ---cut---
export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueApi.use((api) => api.get(input.id)),
	});
}

/** No assignee is `Option.none()`, not an error. */
export function assigneeQuery(input: { issueId: number }) {
	return queryOptions({
		queryKey: ["issue", input.issueId, "assignee"],
		queryFn: () =>
			IssueApi.use((api) => api.assignee(input.issueId)).pipe(
				Effect.map(Option.some),
				Effect.catchTag("IssueNotFound", () => Effect.succeed(Option.none())),
			),
	});
}

type IssueError = ErrorOf<typeof issueQuery>;
//   ^?
type AssigneeError = ErrorOf<typeof assigneeQuery>;
//   ^?
type Services = ServicesOf<typeof issueQuery>;
//   ^?
```

### The client

The `QueryClient`'s `layer` provides the services, and the router context carries the client with their type, so loaders can only start queries the layer can run:

```tsx twoslash title="src/router.tsx"
/// <reference types="vite/client" />
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { routeTree } from "./routeTree.gen.ts";
import { IssueApiLive } from "./_effect.ts";
declare function createRouter(options: Record<string, unknown>): unknown;
declare function setupRouterIntegration(options: {
	readonly queryClient: QueryClient<unknown>;
	readonly router: unknown;
}): void;
// ---cut---
export function getRouter() {
	const queryClient = new QueryClient({
		defaults: { staleTime: 5000 },
		layer: IssueApiLive,
	});
	queryClient;
	// ^?
	const router = createRouter({
		context: { queryClient },
		defaultPreloadStaleTime: 0,
		routeTree,
		Wrap: (props: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({ queryClient, router });
	return router;
}
```

```tsx twoslash title="src/routes/__root.tsx"
import type { QueryClient } from "@raf-query/react";
import { createRootRouteWithContext } from "./_twoslash.ts";
import type { IssueApi } from "./_effect.ts";
// ---cut---
export const Route = createRootRouteWithContext<{
	queryClient: QueryClient<IssueApi>;
}>()({});
```

### The route

Loaders use the same Promise verbs as a non-Effect app. Prefetch is sync; `ensure` returns a Promise. Drop into Effect only when you need a typed catch (or to `yield*` a service yourself). `queryClient.effect` is the cache's Effect API, and `runPromise` runs it with the layer's services — the same shape as Effect's `ManagedRuntime`:

```tsx twoslash title="src/routes/issues.$issueId.tsx"
import { type QueryHandle, useQuery } from "@raf-query/react";
import { notFound } from "@tanstack/react-router";
import { Effect, Option } from "effect";
import { Suspense, use, type ReactNode } from "react";
import {
	assigneeQuery,
	createFileRoute,
	type Issue,
	issueQuery,
} from "./_effect.ts";
declare function RenameForm(props: { readonly issue: Issue }): ReactNode;
// ---cut---
export const Route = createFileRoute("/issues/$issueId")({
	loader: (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.issueId);
		return qc.runPromise(
			qc.effect.ensure(issueQuery, { id }).pipe(
				Effect.catchTag("IssueNotFound", () => Effect.fail(notFound())),
				Effect.map((issue) => ({
					assignee: qc.prefetch(assigneeQuery, { issueId: id }),
					issue,
				})),
			),
		);
	},
	component: IssuePage,
	errorComponent: (props) => (
		<div role="alert">
			<p>Couldn't load the issue.</p>
			<button onClick={props.reset}>Try again</button>
		</div>
	),
});

function IssuePage() {
	const loaderData = Route.useLoaderData();
	const [issue] = useQuery(issueQuery, loaderData.issue); // ensured: the data
	return (
		<article>
			<h1>{issue.title}</h1>
			<RenameForm issue={issue} />
			<Suspense fallback={<p>Loading assignee…</p>}>
				<Assignee handle={loaderData.assignee} />
			</Suspense>
		</article>
	);
}

function Assignee(props: { handle: QueryHandle<typeof assigneeQuery> }) {
	const [assigneePromise] = useQuery(assigneeQuery, props.handle);
	const assignee = use(assigneePromise);
	//    ^?
	return Option.match(assignee, {
		onNone: () => <p>Unassigned</p>,
		onSome: (user) => <p>{user.name}</p>,
	});
}
```

A list page that only prefetches never needs `runPromise`:

```ts
loader: (args) => {
	const qc = args.context.queryClient;
	return {
		counts: qc.prefetch(issueCountsQuery),
		issues: qc.prefetch(issueListQuery, args.deps),
	};
},
```

What the loader doesn't catch, like `Unauthorized`, rejects into `errorComponent`. The components never see the services: the cache runs each `queryFn` with the layer's, whoever starts it.

### A form action

The action is an `Effect.fn` that renames and then waits for the refetched issue. It catches every failure `rename` declares into a message, so the Effect can't fail, and the form shows the message:

```tsx twoslash title="src/components/rename-form.tsx"
import { QueryCache } from "@raf-query/react";
import { Effect } from "effect";
import { useActionState } from "react";
import { type Issue, IssueApi, IssueRoute } from "./_effect.ts";
const Route = IssueRoute;
// ---cut---
const rename = Effect.fn("rename")(
	function* (input: { readonly id: number; readonly title: string }) {
		yield* IssueApi.use((api) => api.rename(input));
		yield* QueryCache.QueryCache.use((cache) =>
			cache.invalidate({ queryKey: ["issue", input.id] }),
		);
		return null;
	},
	Effect.catchTags({
		EmptyTitle: () => Effect.succeed("Title can't be empty"),
		Unauthorized: () => Effect.succeed("Sign in to rename issues"),
	}),
);

export function RenameForm(props: { issue: Issue }) {
	const queryClient = Route.useRouteContext().queryClient;
	const [message, action, isPending] = useActionState(
		(_previous: string | null, formData: FormData) =>
			queryClient.runPromise(
				rename({ id: props.issue.id, title: String(formData.get("title")) }),
			),
		null,
	);
	return (
		<form action={action}>
			<input defaultValue={props.issue.title} name="title" />
			<button disabled={isPending}>Rename</button>
			{message === null ? null : <p role="alert">{message}</p>}
		</form>
	);
}
```

The client comes from the router context, not `useQueryClient()`: that one is a `QueryClient<unknown>`, so it can't check the action's services ([Services](./effect-services.md#in-react)). [Typed errors](./effect-errors.md) covers where else to catch failures, and what React sees when you don't.

## Effect queryFns

What an Effect `queryFn` adds over a promise:

- **Typed errors.** The Effect's error type is the query's: `qc.effect.fetch(issueQuery, input)` fails with `IssueNotFound | Unauthorized | Query.CancelledError`. `ErrorOf<TFactory>` names it; it's `unknown` for promises. See [Typed errors](./effect-errors.md).
- **Services.** What the Effect requires, `ServicesOf<TFactory>`, every verb that can start the query requires. See [Services](./effect-services.md).
- **Defects aren't retried.** A `queryFn` that throws instead of returning, or an Effect that dies, is a defect: it fails the request without retrying.
- **Interruption.** Cancelling the request interrupts the fiber, so its finalizers run. No `AbortSignal` needed.
- **Schedules.** `retry` accepts a `Schedule` as well as a count or predicate:

```ts twoslash
import { queryOptions } from "@raf-query/react";
import { Effect, Schedule } from "effect";
import { IssueApi } from "./_effect.ts";
// ---cut---
export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueApi.use((api) => api.get(input.id)),
		retry: Schedule.exponential("200 millis").pipe(Schedule.upTo({ times: 3 })),
	});
}
```

## The cache as an Effect service

`QueryClient` is a Promise wrapper around a `QueryCache` service. `queryClient.runPromise` hands it to loaders and actions, as above, and `qc.effect` is the same service as a value. Effect code outside React builds its own with `QueryCache.make(config)` (scoped: closing the scope interrupts every request and timer) or `QueryCache.layer(config)`:

```ts twoslash
import { Effect } from "effect";
import { issueQuery, IssueApiLive } from "./_effect.ts";
// ---cut---
import { QueryCache } from "@raf-query/core";
import { Stream } from "effect";

const program = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	const issue = yield* cache.fetch(issueQuery, { id: 1 });
	yield* cache.watch(issueQuery, { id: 1 }).pipe(
		Stream.map((state) => state.data?.title),
		Stream.runForEach((title) => Effect.log(title)),
	);
});

Effect.runFork(
	program.pipe(
		Effect.provide(QueryCache.layer()),
		Effect.provide(IssueApiLive),
	),
);
```

The cache has every verb as an Effect: `prefetch`, `ensure`, `fetch`, `invalidate`, `reset`, `remove`, `setData`, `getData` (an `Option`), `isFetching` (a count), `dehydrate` and `hydrate`. `watch` is a `Stream` of an entry's state, and `events` a `Stream` of cache events.

`watch` counts as a reader while it runs, so invalidation and window focus refetch the entry. Outside React, `cache.mount` (`Effect<void, never, Scope>`) refetches read, stale entries on window focus and reconnect while its scope is open.

## Entries and observers

Entries are a data type with module functions, like Effect's own modules:

```ts twoslash
import { Effect } from "effect";
import { issueQuery } from "./_effect.ts";
// ---cut---
import { Query, QueryCache } from "@raf-query/core";

const program = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	const query = yield* cache.getQuery(issueQuery, { id: 1 });
	yield* Query.fetch(query);
	yield* Query.invalidate(query);
	return Query.getUnsafe(query); // synchronous read
});
```

`Query.changes(query)` streams the entry's state, and `Query.subscribeUnsafe(query, listener)` is the synchronous version.

`QueryObserver` is one reader's view of a query, as `useQuery` sees it: the controls and the promise, with `whilePending`, `refetchInterval` and the focus and reconnect options. `QueryObserver.make(query, options)` creates one, and `QueryObserver.changes(observer)` streams its results. While it runs, the query counts as read and polls on `refetchInterval`. It's the building block for bindings to other frameworks.

## SSR streaming

The SSR integrations are thin wrappers over Effect APIs:

- `dehydrateStream(options)` (scoped) returns the cache's `initial` state and a `Stream` of `updates`: entries that start or settle later, each sent once, batched per microtask. The stream ends when the scope closes.
- `hydrateStream(stream)` hydrates each state as it arrives.
- `Stream.toReadableStream` and `Stream.fromReadableStream` carry it over a web stream.

The `sent` option (a `Set` of hashes) makes separate `dehydrate` calls of one request skip entries already sent.

## Time and the page

Time comes from Effect's `Clock`, and the page from the `Platform` service (focus, visibility, `navigator.onLine`; the default reads the globals). Provide `TestClock` or another `Platform` to test staleness, garbage collection and offline retries without a browser. See [Testing](./testing.md).
