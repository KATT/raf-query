---
title: Testing
description: Test components and loaders that use raf-query with a fresh client per test, seeded data, a fake clock and a fake page.
section: Guides
order: 21
---

Components that read queries need a `QueryClient` and handles. In tests, create both directly. There's nothing to mock in raf-query itself: mock your API, or seed the cache.

## A client per test

Create a new client for every test, so no cached data leaks between them. Turn retries off, or a failing request takes seconds to fail:

```tsx
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { render } from "@testing-library/react";

let queryClient: QueryClient;

beforeEach(() => {
	queryClient = new QueryClient({ defaults: { retry: false } });
});

afterEach(async () => {
	await queryClient.dispose();
});

function renderWithClient(ui: React.ReactNode) {
	return render(
		<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
	);
}
```

`dispose()` interrupts in-flight requests and timers, so nothing runs after the test ends.

## Testing a component

A component takes a handle as a prop, so a test can start the query itself, the same way a loader would:

```tsx
test("shows the post", async () => {
	const handle = queryClient.prefetch(postQuery, { slug: "hello" });

	renderWithClient(
		<Suspense fallback="Loading…">
			<Post handle={handle} />
		</Suspense>,
	);

	expect(await screen.findByRole("heading")).toHaveTextContent("Hello");
});
```

For an `EnsuredQueryHandle`, `await queryClient.ensure(...)` instead.

## Seeding the cache

To render with known data and no request at all, write it with `setData` before rendering:

```ts
queryClient.setData(
	postQuery,
	{ slug: "hello" },
	{ slug: "hello", title: "Hello" },
);
const handle = await queryClient.ensure(postQuery, { slug: "hello" });
```

Data written with `setData` is fresh, so `ensure` resolves at once without calling the `queryFn`.

## Mocking the network

The `queryFn` is your code, so mock what it calls. With `fetch`, [MSW](https://mswjs.io) intercepts requests without changing application code:

```ts
server.use(
	http.get("/api/posts/:slug", () =>
		HttpResponse.json({ slug: "hello", title: "Hello" }),
	),
);
```

## Testing loaders

A loader is a function of its context. Call it with a client, and check what it started:

```ts
test("the post loader starts both queries", async () => {
	await Route.options.loader({
		context: { queryClient },
		params: { slug: "hello" },
	});
	expect(queryClient.getData(postQuery, { slug: "hello" })).toBeDefined();
	expect(queryClient.isFetching({ queryKey: ["comments"] })).toBe(1);
});
```

## Time, focus and the network

Staleness, garbage collection, retries and polling depend on time; focus refetching and offline retries depend on the page. raf-query reads both from Effect services, so a test can replace them instead of mocking globals:

- **Time** comes from Effect's `Clock`. Use `TestClock` to move time forward instantly.
- **The page** comes from the `Platform` service: whether it's visible, whether it's online, and its focus and reconnect events.

```ts
import { Platform, QueryCache, QueryClient } from "@raf-query/react";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";

const listeners = new Set<(event: "focus" | "online") => void>();
let visible = true;

const FakePlatform = Layer.succeed(Platform.Platform, {
	isOnlineUnsafe: () => true,
	isServer: false,
	isVisibleUnsafe: () => visible,
	subscribeUnsafe(listener) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
});

function focus() {
	visible = true;
	for (const listener of listeners) listener("focus");
}

const queryClient = new QueryClient({ layer: FakePlatform });
```

With a fake clock, a test of `staleTime` or `gcTime` runs in milliseconds. [`@effect/vitest`](https://effect.website/docs/testing/vitest/)'s `it.effect` provides `TestClock`:

```ts
import { expect, it } from "@effect/vitest";
import { Option } from "effect";

it.effect("garbage-collects unread entries", () =>
	Effect.gen(function* () {
		const cache = yield* QueryCache.QueryCache;
		yield* cache.fetch(todosQuery);
		yield* TestClock.adjust("5 minutes");
		expect(Option.isNone(yield* cache.getData(todosQuery))).toBe(true);
	}).pipe(Effect.provide(QueryCache.layer()), Effect.provide(FakePlatform)),
);
```

In a plain Vitest test without Effect, `vi.useFakeTimers()` also works: the default clock reads `Date.now()` and schedules with `setTimeout`.

## Server rendering

A client created where `window` isn't defined behaves as a server client: no retries, no garbage collection, cached data never stale. To test browser behavior in Node without a DOM environment, pass `isServer: false`:

```ts
const queryClient = new QueryClient({ isServer: false });
```
