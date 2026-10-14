---
title: Quick start
description: Set up a QueryClient, define a query factory, start it in a TanStack Start loader and read it with useQuery and use().
section: Getting started
order: 3
---

This walks through the three core concepts of raf-query on [TanStack Start](https://tanstack.com/start):

- **Query factories**, which describe a query once
- **Starting queries** in a loader, which hands components a handle
- **Reading queries** with `useQuery` and `use()`

For the Next.js App Router, the same steps apply with a server component in place of the loader: see [React Server Components](./nextjs.md).

## 1. Create the client

Create one `QueryClient` per router. On the server, `getRouter` runs once per request, so each request gets its own cache; in the browser it runs once per tab.

```tsx title="src/router.tsx"
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const queryClient = new QueryClient();
	const router = createRouter({
		routeTree,
		context: { queryClient },
		defaultPreload: "intent",
		// The query cache decides what's fresh; loaders always run and dedupe there.
		defaultPreloadStaleTime: 0,
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({ router, queryClient });
	return router;
}
```

`setupRouterIntegration` streams the server's cache to the browser while the page renders, so data loaded on the server is never fetched twice. Give the root route the client's type:

```tsx title="src/routes/__root.tsx"
import type { QueryClient } from "@raf-query/react";
import { createRootRouteWithContext } from "@tanstack/react-router";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	// ...
});
```

## 2. Define a query

A query is a **factory**: a function of at most one argument that returns `queryOptions(...)`. The argument is the query's input. Loaders and components call the same factory, so the data's type flows end to end.

```ts title="src/queries.ts"
import { queryOptions } from "@raf-query/react";

export function todosQuery() {
	return queryOptions({
		queryKey: ["todos"],
		queryFn: async () => {
			const response = await fetch("/api/todos");
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return (await response.json()) as Array<{ id: number; title: string }>;
		},
	});
}

export function todoQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["todos", input.id],
		queryFn: () => fetchTodo(input.id),
		staleTime: 30_000,
	});
}
```

## 3. Start it in the loader

The loader starts the query and returns its **handle**, a small `{ key, input }` object:

```tsx title="src/routes/todos.tsx"
import { useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";

import { todosQuery } from "../queries";

export const Route = createFileRoute("/todos")({
	loader: (args) => ({
		todos: args.context.queryClient.prefetch(todosQuery),
	}),
	component: TodosPage,
});
```

`prefetch` starts the request and returns immediately, so the page renders while the data is on its way. Use `ensure` instead when the page can't lay out without the data: the navigation then waits for it. [Starting queries](./starting-queries.md) covers the trade-off.

## 4. Read it in a component

```tsx title="src/routes/todos.tsx"
function TodosPage() {
	const loaderData = Route.useLoaderData();
	return (
		<Suspense fallback={<p>Loading…</p>}>
			<TodoList handle={loaderData.todos} />
		</Suspense>
	);
}

function TodoList(props: { handle: QueryHandle<typeof todosQuery> }) {
	const [todosPromise, todosState] = useQuery(todosQuery, props.handle);
	const todos = use(todosPromise);
	return (
		<ul aria-busy={todosState.isFetching}>
			{todos.map((todo) => (
				<li key={todo.id}>{todo.title}</li>
			))}
		</ul>
	);
}
```

`useQuery` returns a stable promise and the query's controls. `use()` suspends until the data is there, then returns it; once the cache has data, the promise is already resolved and `use()` returns synchronously.

## 5. Write data with an Action

There is no `useMutation`. Write in a form action, then invalidate what changed:

```tsx
function AddTodo() {
	const qc = useQueryClient();
	return (
		<form
			action={async (formData) => {
				await createTodo({ title: String(formData.get("title")) });
				await qc.invalidate(todosQuery);
			}}
		>
			<input name="title" />
			<button>Add</button>
		</form>
	);
}
```

`await qc.invalidate(...)` resolves once every query being read has refetched, so the form stays pending until the new todo is on screen. See [Mutations](./mutations.md) for optimistic updates and errors.

## What you get for free

Out of the box the cache dedupes requests, retries failures, refetches stale data when the window regains focus, garbage-collects unused entries and keeps unchanged data referentially stable. Read [Important defaults](./important-defaults.md) next: they explain when raf-query fetches and when it doesn't.
