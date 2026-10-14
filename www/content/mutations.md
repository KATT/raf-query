---
title: Mutations
description: Write data with form actions and transitions, keep the UI responsive with useOptimistic, then invalidate or update the cache.
section: Guides
order: 12
---

raf-query has no `useMutation`. React already has the pieces a mutation needs:

- **Actions** (`<form action>`, `startTransition(async () => ...)`) run the write and track its pending state.
- **`useOptimistic`** shows the result before the server confirms it, and rolls back on its own when the action ends.
- **`useActionState`** keeps the action's result, such as an error message.

The cache's part is what happens after the write: [invalidating](./query-invalidation.md) the queries it affected, or writing the response straight into the cache with `setData`.

```tsx twoslash
import { useOptimistic } from "react";
import { useQueryClient } from "@raf-query/react";
import { type Post, updatePost } from "~/api.ts";
import { postQuery } from "~/queries.ts";
// ---cut---
function EditTitle(props: { post: Post }) {
	const qc = useQueryClient();
	const [title, setOptimisticTitle] = useOptimistic(props.post.title);

	return (
		<form
			action={async (formData) => {
				const next = String(formData.get("title"));
				setOptimisticTitle(next);
				await updatePost({ slug: props.post.slug, title: next });
				await qc.invalidate(postQuery, { slug: props.post.slug });
			}}
		>
			<input name="title" defaultValue={title} />
		</form>
	);
}
```

`updatePost` is a plain async function: a TanStack Start server function, a Next.js server action, or a `fetch` call.

`await qc.invalidate(...)` resolves once every query currently being read has refetched. Awaiting it inside the action keeps the action pending until the fresh data is on screen, so the optimistic value is replaced by the real one without flickering back to the old one in between.

## Optimistic updates

`useOptimistic` holds a value for as long as an action is running. When the action ends, it falls back to the value passed in, which by then is the refetched data. If the action throws, it falls back to the old data: the rollback is automatic.

Add a todo below. The server is slow, and you can make the next request fail to watch the optimistic item roll back:

```demo
optimistic-updates
```

The demo's form:

```tsx twoslash
import { useActionState, useOptimistic } from "react";
import { useQueryClient } from "@raf-query/react";
import { todosQuery } from "~/queries.ts";
type Todo = { id: number; pending?: boolean; text: string };
declare function addTodo(text: string): Promise<void>;
// ---cut---
function AddTodo(props: { todos: Todo[] }) {
	const qc = useQueryClient();
	const [todos, addOptimistic] = useOptimistic(
		props.todos,
		(current, text: string) => [...current, { id: -1, pending: true, text }],
	);
	const [error, formAction] = useActionState(
		async (_previous: string | null, formData: FormData) => {
			const text = String(formData.get("text"));
			addOptimistic(text);
			try {
				await addTodo(text);
			} catch (error) {
				return error instanceof Error ? error.message : "Something went wrong";
			}
			await qc.invalidate(todosQuery);
			return null;
		},
		null,
	);
	// ...
}
```

### Optimistic updates in the cache

`useOptimistic` covers the component that ran the action. When other parts of the page show the same data (a count in the sidebar, the same item in another list), update the cache instead, so every reader sees it:

```ts twoslash
import { QueryClient } from "@raf-query/react";
import { todosQuery } from "~/queries.ts";
declare function toggleTodoApi(id: number): Promise<void>;
const qc = new QueryClient();
const api = { toggleTodo: toggleTodoApi };
// ---cut---
async function toggleTodo(id: number) {
	const previous = qc.getData(todosQuery);
	qc.setData(todosQuery, undefined, (todos) =>
		(todos ?? []).map((todo) =>
			todo.id === id ? { ...todo, done: !todo.done } : todo,
		),
	);
	try {
		await api.toggleTodo(id);
	} catch (error) {
		qc.setData(todosQuery, undefined, previous ?? []);
		throw error;
	} finally {
		await qc.invalidate(todosQuery);
	}
}
```

This is more code, and you're responsible for the rollback. Reach for it only when `useOptimistic` can't reach the readers that need the update.

## Updates from mutation responses

When the server responds with the updated object, write it into the cache instead of refetching:

```ts twoslash
import { QueryClient } from "@raf-query/react";
import { updatePost } from "~/api.ts";
import { postQuery } from "~/queries.ts";
const qc = new QueryClient();
declare const slug: string;
declare const title: string;
// ---cut---
const updated = await updatePost({ slug, title });
qc.setData(postQuery, { slug }, updated);
```

`setData` takes a value or an updater, `(previous) => next`. Readers re-render with the new data at once, without suspending. The entry is created if it doesn't exist yet, and data written with `setData` counts as just fetched, so it's fresh for `staleTime`.

Keep updaters immutable: return new objects and arrays. Structural sharing compares the new data with the old, so mutating `previous` in place can hide the change from readers.

## Error messages

Wrap the action in `useActionState` and return the caught error, as the demo does. The returned value is the action's state, so the form can render it next to the input. An error thrown out of an action (instead of returned) goes to the nearest error boundary.

## Pending state

Inside a form, `useFormStatus()` gives a submit button the form's pending state. Outside one, `useTransition` returns `isPending` for the actions you start with its `startTransition`:

```tsx twoslash
import { useTransition } from "react";
import { QueryClient } from "@raf-query/react";
import { queryOptions } from "@raf-query/react";
const qc = new QueryClient();
declare function deletePost(slug: string): Promise<void>;
declare const props: { slug: string };
function postsQuery() {
	return queryOptions({
		queryKey: ["posts"],
		queryFn: async () => [] as Array<{ slug: string }>,
	});
}
// ---cut---
const [isPending, startTransition] = useTransition();

<button
	disabled={isPending}
	onClick={() => {
		startTransition(async () => {
			await deletePost(props.slug);
			await qc.invalidate(postsQuery);
		});
	}}
>
	Delete
</button>;
```

## Mutations that navigate

After creating a post, you usually navigate to it. Navigate after invalidating, and the destination's loader finds the cache already up to date. If the destination's loader `ensure`s the new post, you can skip the invalidation for it entirely: a cache miss always fetches.

## Serial mutations

Actions run concurrently by default. When writes must happen in order (each depends on the server's response to the previous one), queue them in your own code, or disable the form while one is pending.
