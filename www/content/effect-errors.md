---
title: Typed errors
description: An Effect queryFn's error type is the query's. Every Effect verb fails with it, so you catch what you expect with catchTag, and the rest throws to React's error boundaries.
section: Effect
order: 3
---

An Effect `queryFn`'s error type is the query's error type. It flows through the factory: `ErrorOf<TFactory>` names it, and every verb on the cache fails with it. Catch the failures you expect with `Effect.catchTag`, and the type tells you what's left. Whatever you don't catch throws, as a rejected promise does, and React shows it in an error boundary.

The examples use the issue tracker from [Using Effect](./effect.md#the-whole-picture): an `IssueApi` service whose methods fail with `IssueNotFound`, `Unauthorized` and `EmptyTitle`.

## Inferred from the queryFn

```ts twoslash
import { type ErrorOf, QueryCache, queryOptions } from "@raf-query/react";
import { Effect } from "effect";
import { IssueApi } from "./_effect.ts";
// ---cut---
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
import { Effect, Schema } from "effect";
import { IssueApi, Unauthorized } from "./_effect.ts";
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

The caught case is now part of the data, so the component that reads the query handles it like any other value:

```tsx twoslash
import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";
import { assigneeQuery } from "./_effect.ts";
// ---cut---
function Assignee(props: { handle: QueryHandle<typeof assigneeQuery> }) {
	const [assigneePromise] = useQuery(assigneeQuery, props.handle);
	const assignee = use(assigneePromise);
	//    ^?
	return <p>{assignee === null ? "Unassigned" : assignee.name}</p>;
}
```

`retry` and `retryDelay` get the error as `unknown`, because query defaults share them. Narrow it with the error's schema, as `retry` does above.

## Catch it where you call

Loaders and form actions are Effects too. `queryClient.runPromise(effect)` runs one with the cache (`QueryCache`) and the services of the client's [layer](./effect-services.md#services-in-queryclient). The failures stay typed until the Effect catches them, and the promise rejects with whatever is left.

A loader can turn a typed failure into the router's own error. Here a missing issue becomes TanStack Router's `notFound()`, so the route renders its not-found page, and anything else reaches `errorComponent`:

```tsx twoslash title="src/routes/issues.$issueId.tsx"
import { QueryCache } from "@raf-query/react";
import { notFound } from "@tanstack/react-router";
import { Effect } from "effect";
import { createFileRoute, issueQuery } from "./_effect.ts";
// ---cut---
export const Route = createFileRoute("/issues/$issueId")({
	loader: (args) =>
		args.context.queryClient.runPromise(
			Effect.gen(function* () {
				const cache = yield* QueryCache.QueryCache;
				const issue = cache.ensure(issueQuery, {
					id: Number(args.params.issueId),
				});
				return {
					issue: yield* issue.pipe(
						Effect.catchTag("IssueNotFound", () => Effect.fail(notFound())),
					),
				};
			}),
		),
	errorComponent: (props) => (
		<div role="alert">
			<p>Couldn't load the issue.</p>
			<button onClick={props.reset}>Try again</button>
		</div>
	),
});
```

A form action can catch every failure it declares into the message the form shows. `Effect.catchTags` lists them, and the Effect is left with `never` in its error channel, so its promise never rejects:

```tsx twoslash title="src/components/rename-form.tsx"
import { QueryCache } from "@raf-query/react";
import { Effect } from "effect";
import { useActionState } from "react";
import { type Issue, IssueApi, IssueRoute } from "./_effect.ts";
const Route = IssueRoute;
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

Leave a tag out of `catchTags` and it stays in the error type: the promise can reject with it, and the action throws it to the nearest error boundary.

## Or let it throw

You don't have to catch anything. A failure the Effect leaves uncaught behaves like a rejected promise:

- The Promise verbs (`queryClient.fetch`, `ensure`, `runPromise`) reject with the failure itself, the `IssueNotFound` instance, not a wrapper around it.
- When a query's first load fails, `use()` throws the failure to the nearest error boundary, and resetting the boundary refetches.
- A failed background refetch keeps the old data on screen and puts the failure in `controls.error`.
- A loader that rejects renders the route's `errorComponent`, and an action that rejects throws to the nearest error boundary.

React can't know which query an error boundary caught, so there the error is `unknown`. It can also be a defect, or another query's error. Narrow it with the error's schema. Here an error boundary around the assignee keeps a failure from taking down the issue page, and the issue's title shows a hint when a refetch fails:

```tsx twoslash
import {
	type EnsuredQueryHandle,
	type QueryHandle,
	useQuery,
} from "@raf-query/react";
import { CatchBoundary } from "@tanstack/react-router";
import { Schema } from "effect";
import { Suspense, type ReactNode } from "react";
import { assigneeQuery, issueQuery, Unauthorized } from "./_effect.ts";
declare function Assignee(props: {
	handle: QueryHandle<typeof assigneeQuery>;
}): ReactNode;
// ---cut---
function AssigneeSection(props: { handle: QueryHandle<typeof assigneeQuery> }) {
	return (
		<CatchBoundary
			getResetKey={() => props.handle.input.issueId}
			errorComponent={(boundary) => (
				<div role="alert">
					{Schema.is(Unauthorized)(boundary.error) ? (
						<p>Sign in to see who's assigned.</p>
					) : (
						<p>Couldn't load the assignee.</p>
					)}
					<button onClick={boundary.reset}>Try again</button>
				</div>
			)}
		>
			<Suspense fallback={<p>Loading assignee…</p>}>
				<Assignee handle={props.handle} />
			</Suspense>
		</CatchBoundary>
	);
}

function IssueTitle(props: { handle: EnsuredQueryHandle<typeof issueQuery> }) {
	const [issue, controls] = useQuery(issueQuery, props.handle);
	return (
		<header>
			<h1>{issue.title}</h1>
			{Schema.is(Unauthorized)(controls.error) ? (
				<p role="status">Signed out. Showing the last copy.</p>
			) : null}
		</header>
	);
}
```

A query that failed during server rendering rejects in the browser with a `RedactedError`, unless the integration sets `keepErrors` ([SSR and hydration](./ssr-and-hydration.md#errors)), so `Schema.is` is false for it. The fallback branch covers it, and resetting the boundary refetches from the browser, where the failure keeps its type.
