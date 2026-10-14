---
title: Retries and errors
description: Retry failed requests with counts, predicates or Schedules, choose delays, and show errors with error boundaries.
section: Guides
order: 14
---

When a request fails in the browser, raf-query retries it **3 times**, waiting 1, 2 and then 4 seconds, before treating the query as failed. Readers keep suspending, or keep showing their current data, the whole time.

```ts twoslash
import { queryOptions } from "@raf-query/react";
import { getPost } from "./_twoslash.ts";
// ---cut---
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		retry: 5, // or false, true, a predicate, or a Schedule
	});
}
```

| `retry`                                | Retries                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `3` (default in the browser)           | Up to that many times                                 |
| `0` or `false` (default on the server) | Never                                                 |
| `true`                                 | Forever                                               |
| `(failureCount, error) => boolean`     | While it returns `true`. `failureCount` starts at `1` |
| A `Schedule`                           | As the [Effect](./effect.md) schedule decides         |

Server renders never retry by default: the user is waiting for the HTML, and a failure can be retried by the browser instead.

A predicate is the place to skip retries for errors that won't go away:

```ts twoslash
import { queryOptions } from "@raf-query/react";
import { getPost } from "./_twoslash.ts";
declare class HttpError extends Error {
	readonly status: number;
}
// ---cut---
queryOptions({
	queryKey: ["post", "hello"],
	queryFn: () => getPost("hello"),
	retry: (failureCount, error) =>
		failureCount <= 3 && !(error instanceof HttpError && error.status === 404),
});
```

Set it once for the app with `config.defaults`:

```ts twoslash
import { QueryClient } from "@raf-query/react";
// ---cut---
const queryClient = new QueryClient({
	defaults: { retry: 1 },
});
```

## Retry delay

`retryDelay` sets the wait before each retry. The default doubles from one second, up to 30 seconds. Pass a number for a constant delay, or a function:

```ts twoslash
import { queryOptions } from "@raf-query/react";
import { getPost } from "./_twoslash.ts";
// ---cut---
queryOptions({
	queryKey: ["post", "hello"],
	queryFn: () => getPost("hello"),
	// Constant
	retryDelay: 1000,
});

queryOptions({
	queryKey: ["post", "hello"],
	queryFn: () => getPost("hello"),
	// Exponential with a ceiling, the default's shape
	retryDelay: (failureCount) =>
		Math.min(1000 * 2 ** (failureCount - 1), 30_000),
});
```

### Retries while offline

In the browser, retries pause while `navigator.onLine` is `false`: after the delay, the next attempt waits for the window's `online` event. The request counts as fetching meanwhile. The first attempt always runs, since `navigator.onLine` can't be trusted to be right.

## Showing errors

What the user sees depends on whether there was data before the failure.

**The first load fails.** The query's promise rejects, so `use()` throws to the nearest error boundary. Resetting that boundary re-renders the reader, which refetches the query:

```tsx twoslash
import { Suspense } from "react";
import { type QueryHandle } from "@raf-query/react";
import { CatchBoundary } from "@tanstack/react-router";
import { commentsQuery } from "./_twoslash.ts";
declare const post: { hash: string };
declare const loaderData: { comments: QueryHandle<typeof commentsQuery> };
declare function Comments(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}): React.ReactNode;
declare function CommentsSkeleton(): React.ReactNode;
// ---cut---
import { CatchBoundary } from "@tanstack/react-router";

<CatchBoundary
	getResetKey={() => post.hash}
	errorComponent={(props) => (
		<div role="alert">
			<p>
				Couldn't load comments:{" "}
				{props.error instanceof Error
					? props.error.message
					: String(props.error)}
			</p>
			<button onClick={props.reset}>Try again</button>
		</div>
	)}
>
	<Suspense fallback={<CommentsSkeleton />}>
		<Comments handle={loaderData.comments} />
	</Suspense>
</CatchBoundary>;
```

Any error boundary works: `CatchBoundary` from TanStack Router, `react-error-boundary`, Next.js's `error.tsx`, or your own class component.

**A background refetch fails.** The existing data stays on screen: losing it because a refetch failed would be worse than showing it a little longer. The error is on the reader's controls as `error`, for a hint:

```tsx twoslash
import { type EnsuredQueryHandle, useQuery } from "@raf-query/react";
import { postQuery } from "./_twoslash.ts";
declare const loaderData: { post: EnsuredQueryHandle<typeof postQuery> };
declare function formatTime(value: number): string;
// ---cut---
const [post, postState] = useQuery(postQuery, loaderData.post);

{
	postState.error ? (
		<p role="status">
			Couldn't refresh. Showing data from {formatTime(postState.updatedAt)}.
		</p>
	) : null;
}
```

Make the next request fail in the demo, then reload a post to see each case:

```demo
retries
```

## Errors from loaders

A failed `prefetch` never throws out of the loader: the error surfaces where the data is read, and only that part of the page shows it. A failed `ensure` or `fetch` rejects, so it reaches the route's error boundary (`errorComponent` in TanStack Router, `error.tsx` in Next.js), replacing the page.

This is one more reason to choose per query: `ensure` what the page can't do without, and `prefetch` the rest, so a failing sidebar doesn't take the whole page down.

## One place for every error

`config.onError` is called for every failed request, after its retries, whether or not anything shows it. It's the place for logging and toasts:

```ts twoslash
import { QueryClient } from "@raf-query/react";
declare function reportError(
	error: unknown,
	context: { readonly key: unknown },
): void;
// ---cut---
const queryClient = new QueryClient({
	onError: (error, query) => {
		reportError(error, { key: query.key });
	},
});
```

Combine it with [query meta](./query-meta.md) for a per-query message.

## Redirects

In TanStack Start, a `queryFn` can throw the router's `redirect()`, for instance when a session has expired. `setupRouterIntegration` turns it into a navigation wherever the query failed: a loader, a render or a background refetch. Redirects aren't retried.
