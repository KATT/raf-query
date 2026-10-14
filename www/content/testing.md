---
title: Testing
description: Test components and loaders that use raf-query with a fresh client per test, seeded data, a fake clock and a fake page.
section: Guides
order: 21
---

Components that read queries need a `QueryClient` and handles. In tests, create both directly. There's nothing to mock in raf-query itself: mock your API, or seed the cache.

## A client per test

Create a new client for every test, so no cached data leaks between them. Turn retries off, or a failing request takes seconds to fail:

```tsx twoslash
import type { ReactNode } from "react";
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => Promise<void>): void;
declare function act<T>(fn: () => T | Promise<T>): Promise<T>;
declare function render(ui: ReactNode): unknown;
// ---cut---
import { QueryClient, QueryClientProvider } from "@raf-query/react";

let queryClient: QueryClient;

beforeEach(() => {
	queryClient = new QueryClient({ defaults: { retry: false } });
});

afterEach(async () => {
	await queryClient.dispose();
});

function renderWithClient(ui: ReactNode) {
	return act(async () =>
		render(
			<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
		),
	);
}
```

`dispose()` interrupts in-flight requests and timers, so nothing runs after the test ends.

Render inside an awaited, async `act`. A tree that suspends inside a sync `act`, which `render` on its own uses, is never retried by React once its data lands, with or without a Suspense boundary. The same holds for any `use(promise)`, not only raf-query's.

## Testing a component

A component takes a handle as a prop, so a test can start the query itself, the same way a loader would:

```tsx twoslash
import {
	type QueryClient,
	type QueryHandle,
	QueryClientProvider,
} from "@raf-query/react";
import { Suspense, type ReactNode } from "react";
import { postQuery } from "./_twoslash.ts";
declare let queryClient: QueryClient;
declare function act<T>(fn: () => T | Promise<T>): Promise<T>;
declare function render(ui: ReactNode): unknown;
declare function renderWithClient(ui: ReactNode): Promise<unknown>;
declare function test(name: string, fn: () => Promise<void>): void;
declare function expect(value: unknown): {
	toHaveTextContent(text: string): void;
};
declare const screen: {
	findByRole(role: string): Promise<{ toHaveTextContent?: unknown } & object>;
};
declare function Post(props: {
	handle: QueryHandle<typeof postQuery>;
}): ReactNode;
// ---cut---
test("shows the post", async () => {
	const handle = queryClient.prefetch(postQuery, { slug: "hello" });

	await renderWithClient(
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

```ts twoslash
import { QueryClient } from "@raf-query/react";
import { postQuery } from "./_twoslash.ts";
const queryClient = new QueryClient();
// ---cut---
queryClient.setData(
	postQuery,
	{ slug: "hello" },
	{ slug: "hello", title: "Hello", body: "", authorId: "" },
);
const handle = await queryClient.ensure(postQuery, { slug: "hello" });
```

Data written with `setData` is fresh, so `ensure` resolves at once without calling the `queryFn`.

## Mocking the network

The `queryFn` is your code, so mock what it calls. With `fetch`, [MSW](https://mswjs.io) intercepts requests without changing application code:

```ts twoslash
declare const server: {
	use(...handlers: ReadonlyArray<unknown>): void;
};
declare const http: {
	get(path: string, resolver: () => unknown): unknown;
};
declare const HttpResponse: {
	json(body: unknown): unknown;
};
// ---cut---
server.use(
	http.get("/api/posts/:slug", () =>
		HttpResponse.json({ slug: "hello", title: "Hello" }),
	),
);
```

## Testing loaders

A loader is a function of its context. Call it with a client, and check what it started:

```ts twoslash
import { QueryClient } from "@raf-query/react";
import { commentsQuery, postQuery } from "./_twoslash.ts";
const queryClient = new QueryClient();
declare function test(name: string, fn: () => Promise<void>): void;
declare function expect(value: unknown): {
	toBeDefined(): void;
	toBe(expected: unknown): void;
};
declare const Route: {
	options: {
		loader(args: {
			context: { queryClient: QueryClient };
			params: { slug: string };
		}): Promise<unknown> | unknown;
	};
};
// ---cut---
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

```ts twoslash
import { Platform, QueryClient } from "@raf-query/react";
import { Layer } from "effect";
// ---cut---
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

```ts twoslash
import { Platform, QueryCache } from "@raf-query/react";
import { Effect, Layer, Option } from "effect";
import { todosQuery } from "./_twoslash.ts";
declare const TestClock: {
	adjust(duration: string): Effect.Effect<void>;
};
declare const it: {
	effect(name: string, fn: () => Effect.Effect<void>): void;
};
declare function expect(value: unknown): { toBe(expected: unknown): void };
const listeners = new Set<(event: "focus" | "online") => void>();
const FakePlatform = Layer.succeed(Platform.Platform, {
	isOnlineUnsafe: () => true,
	isServer: false,
	isVisibleUnsafe: () => true,
	subscribeUnsafe(listener) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
});
// ---cut---
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

```ts twoslash
import { QueryClient } from "@raf-query/react";
// ---cut---
const queryClient = new QueryClient({ isServer: false });
```
