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
		queryFn: () => IssueApi.use((api) => api.get(input.id)),
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

## In React

Success stays success: `use()` yields `User`, not `User | null`. Failures throw to the nearest error boundary. Narrow them with the same tagged-error schemas that built `ErrorOf` — React can't name which query threw, so the boundary's error is `unknown`:

```tsx twoslash
import { type QueryHandle, useQuery } from "@raf-query/react";
import { CatchBoundary } from "@tanstack/react-router";
import { Schema } from "effect";
import { Suspense, use } from "react";
import { assigneeQuery, IssueNotFound, Unauthorized } from "./_effect.ts";
// ---cut---
function Assignee(props: { handle: QueryHandle<typeof assigneeQuery> }) {
	const [assigneePromise] = useQuery(assigneeQuery, props.handle);
	const assignee = use(assigneePromise);
	//    ^?
	return <p>{assignee.name}</p>;
}

function AssigneeSection(props: { handle: QueryHandle<typeof assigneeQuery> }) {
	return (
		<CatchBoundary
			getResetKey={() => props.handle.input.issueId}
			errorComponent={(boundary) => (
				<div role="alert">
					{Schema.is(IssueNotFound)(boundary.error) ? (
						<p>Unassigned</p>
					) : Schema.is(Unauthorized)(boundary.error) ? (
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
```

`retry` and `retryDelay` still get the error as `unknown` (query defaults share them). Narrow with the schema there too:

```ts twoslash
import { type ErrorOf, queryOptions } from "@raf-query/react";
import { Schema } from "effect";
import { assigneeQuery as _, IssueApi, Unauthorized } from "./_effect.ts";
// ---cut---
export function assigneeQuery(input: { issueId: number }) {
	return queryOptions({
		queryKey: ["issue", input.issueId, "assignee"],
		queryFn: () => IssueApi.use((api) => api.assignee(input.issueId)),
		retry: (failures, error) =>
			failures <= 3 && !Schema.is(Unauthorized)(error),
	});
}

type AssigneeError = ErrorOf<typeof assigneeQuery>;
//   ^?
```

## Catch it where you call

Loaders that only `prefetch` or `ensure` use the Promise verbs, the same as a non-Effect app. Reach for `queryClient.runPromise` when the loader itself needs Effect — a typed `catchTag`, or `yield*` of a service. `queryClient.effect` is the cache's Effect API; `runPromise` runs it with the services of the client's [layer](./effect-services.md#services-in-queryclient), as Effect's `ManagedRuntime` does. The failures stay typed until the Effect catches them, and the promise rejects with whatever is left.

A loader can turn a typed failure into the router's own error. Here a missing issue becomes TanStack Router's `notFound()`, so the route renders its not-found page, and anything else reaches `errorComponent`:

```tsx twoslash title="src/routes/issues.$issueId.tsx"
import { notFound } from "@tanstack/react-router";
import { Effect } from "effect";
import { createFileRoute, issueQuery } from "./_effect.ts";
// ---cut---
export const Route = createFileRoute("/issues/$issueId")({
	loader: (args) => {
		const qc = args.context.queryClient;
		return qc.runPromise(
			qc.effect.ensure(issueQuery, { id: Number(args.params.issueId) }).pipe(
				Effect.catchTag("IssueNotFound", () => Effect.fail(notFound())),
				Effect.map((issue) => ({ issue })),
			),
		);
	},
	errorComponent: (props) => (
		<div role="alert">
			<p>Couldn't load the issue.</p>
			<button onClick={props.reset}>Try again</button>
		</div>
	),
});
```

`catchTag("IssueNotFound", …)` type-checks because `ErrorOf<typeof issueQuery>` includes that tag. Leave a tag out and TypeScript rejects the call.

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
- When a query's first load fails, `use()` throws the failure to the nearest error boundary (as above), and resetting the boundary refetches.
- A failed background refetch keeps the old data on screen and puts the failure in `controls.error`.
- A loader that rejects renders the route's `errorComponent`, and an action that rejects throws to the nearest error boundary.

`controls.error` is also `unknown` — narrow it the same way:

```tsx twoslash
import { type EnsuredQueryHandle, useQuery } from "@raf-query/react";
import { Schema } from "effect";
import { issueQuery, Unauthorized } from "./_effect.ts";
// ---cut---
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
