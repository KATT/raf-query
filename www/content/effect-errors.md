---
title: Typed errors
description: An Effect queryFn's error type is the query's. Every Effect verb fails with it, so you catch what you expect with catchTag and let the rest throw to an error boundary.
section: Effect
order: 3
---

An Effect `queryFn`'s error type is the query's error type. It flows through the factory: `ErrorOf<TFactory>` names it, and every verb on the cache fails with it. Catch the failures you expect with `Effect.catchTag`, and the type tells you what's left. Whatever you don't catch throws, as a rejected promise does.

## Inferred from the queryFn

```ts twoslash
import { Context, Effect, Schema } from "effect";
interface Issue {
	readonly id: number;
	readonly title: string;
}
// ---cut---
import { type ErrorOf, QueryCache, queryOptions } from "@raf-query/react";

class IssueNotFound extends Schema.TaggedError<IssueNotFound>()(
	"IssueNotFound",
	{ id: Schema.Number },
) {}
class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}

class IssueApi extends Context.Service<
	IssueApi,
	{
		readonly get: (
			id: number,
		) => Effect.Effect<Issue, IssueNotFound | Unauthorized>;
	}
>()("app/IssueApi") {}

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

type IssueError = ErrorOf<typeof issueQuery>;
//   ^?

const issue = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	return yield* cache.fetch(issueQuery, { id: 1 });
});
issue;
// ^?
```

`ensure` and `fetch` add `Query.CancelledError`, for a request that was cancelled while they waited. `prefetch` never fails: it returns a handle, and readers of the handle see the error.

## Catch it in the queryFn

Catching a failure in the `queryFn` takes it out of the query's error type. That's the place for failures the page treats as data, like a missing assignee that renders as "Unassigned":

```ts twoslash
import { type ErrorOf, queryOptions } from "@raf-query/react";
import { Context, Effect, Schema } from "effect";
interface User {
	readonly name: string;
}
class IssueNotFound extends Schema.TaggedError<IssueNotFound>()(
	"IssueNotFound",
	{ id: Schema.Number },
) {}
class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}
class IssueApi extends Context.Service<
	IssueApi,
	{
		readonly assignee: (
			issueId: number,
		) => Effect.Effect<User, IssueNotFound | Unauthorized>;
	}
>()("app/IssueApi") {}
// ---cut---
export function assigneeQuery(input: { issueId: number }) {
	return queryOptions({
		queryKey: ["issue", input.issueId, "assignee"],
		queryFn: () =>
			Effect.gen(function* () {
				const api = yield* IssueApi;
				return yield* api.assignee(input.issueId);
			}).pipe(Effect.catchTag("IssueNotFound", () => Effect.succeed(null))),
		retry: (failures, error) =>
			failures <= 3 && !Schema.is(Unauthorized)(error),
	});
}

type AssigneeError = ErrorOf<typeof assigneeQuery>;
//   ^?
```

`retry` and `retryDelay` get the error as `unknown`, because query defaults share them. Narrow it with the error's schema.

## Catch it where you call

Loaders and form actions are Effects too. `queryClient.runPromise(effect)` runs one with the cache (`QueryCache`) and the services of the client's [layer](./effect-services.md#services-in-queryclient). The failures stay typed until the Effect catches them, and the promise rejects with whatever is left.

A loader can turn a typed failure into the router's own error. Here a missing issue becomes TanStack Router's `notFound()`, so the route renders its not-found page:

```ts twoslash
import { QueryCache, QueryClient, queryOptions } from "@raf-query/react";
import { Context, Effect, Layer, Schema } from "effect";
declare function notFound(): Error;
interface Issue {
	readonly id: number;
	readonly title: string;
}
class IssueNotFound extends Schema.TaggedError<IssueNotFound>()(
	"IssueNotFound",
	{ id: Schema.Number },
) {}
class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}
class IssueApi extends Context.Service<
	IssueApi,
	{
		readonly get: (
			id: number,
		) => Effect.Effect<Issue, IssueNotFound | Unauthorized>;
	}
>()("app/IssueApi") {}
declare const IssueApiLive: Layer.Layer<IssueApi>;
function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () =>
			Effect.gen(function* () {
				const api = yield* IssueApi;
				return yield* api.get(input.id);
			}),
	});
}
// ---cut---
const queryClient = new QueryClient({ layer: IssueApiLive });

function loadIssue(id: number) {
	return queryClient.runPromise(
		Effect.gen(function* () {
			const cache = yield* QueryCache.QueryCache;
			return yield* cache
				.ensure(issueQuery, { id })
				.pipe(Effect.catchTag("IssueNotFound", () => Effect.fail(notFound())));
		}),
	);
}
```

A form action can catch every failure it declares into the message the form shows. `Effect.catchTags` lists them, and the Effect is left with `never` in its error channel, so its promise never rejects:

```ts twoslash
import { QueryCache, QueryClient } from "@raf-query/react";
import { Context, Effect, Layer, Schema } from "effect";
interface Issue {
	readonly id: number;
	readonly title: string;
}
class EmptyTitle extends Schema.TaggedError<EmptyTitle>()("EmptyTitle", {}) {}
class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}
class IssueApi extends Context.Service<
	IssueApi,
	{
		readonly rename: (input: {
			readonly id: number;
			readonly title: string;
		}) => Effect.Effect<Issue, EmptyTitle | Unauthorized>;
	}
>()("app/IssueApi") {}
declare const IssueApiLive: Layer.Layer<IssueApi>;
const queryClient = new QueryClient({ layer: IssueApiLive });
// ---cut---
const rename = Effect.fn("rename")(
	function* (input: { readonly id: number; readonly title: string }) {
		const api = yield* IssueApi;
		const cache = yield* QueryCache.QueryCache;
		yield* api.rename(input);
		yield* cache.invalidate({ queryKey: ["issue", input.id] });
		return null;
	},
	Effect.catchTags({
		EmptyTitle: () => Effect.succeed("Title can't be empty"),
		Unauthorized: () => Effect.succeed("Sign in to rename issues"),
	}),
);

const renaming = rename({ id: 1, title: "" });
//    ^?

const message = await queryClient.runPromise(renaming); // never rejects
```

Leave a tag out of `catchTags` and it stays in the error type, so the promise can reject with it.

## Or let it throw

You don't have to catch anything. A failure the Effect leaves uncaught behaves like a rejected promise:

- The Promise verbs (`queryClient.fetch`, `ensure`, `runPromise`) reject with the failure itself, the `IssueNotFound` instance, not a wrapper around it.
- When a query's first load fails, `use()` throws the failure to the nearest error boundary, and resetting the boundary refetches. A failed background refetch keeps the old data on screen and puts the failure in `controls.error` ([Reading queries](./reading-queries.md#errors)).
- A TanStack Router loader that rejects renders the route's `errorComponent`.

React can't know which query an error boundary caught, so there the error is `unknown`. It can also be a defect, or another query's error. A query that failed during server rendering rejects in the browser with a `RedactedError` unless the integration sets `keepErrors` ([SSR and hydration](./ssr-and-hydration.md#errors)). Narrow it with the error's schema:

```tsx twoslash
import { Schema } from "effect";
// ---cut---
class IssueNotFound extends Schema.TaggedError<IssueNotFound>()(
	"IssueNotFound",
	{ id: Schema.Number },
) {}

function IssueError(props: { error: unknown }) {
	if (Schema.is(IssueNotFound)(props.error)) {
		return <p>Issue #{props.error.id} doesn't exist.</p>;
	}
	return <p>Something went wrong.</p>;
}
```
