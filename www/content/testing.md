---
title: Testing
description: Test components and loaders that use raf-query with a fresh client per test, seeded data, an injectable clock and real browser events.
section: Guides
order: 21
---

Components that read queries need a query client and handles. In tests, create both directly. There's nothing to mock in raf-query itself: mock your API, or seed the cache. The examples use [Vitest](https://vitest.dev) and [Testing Library](https://testing-library.com/docs/react-testing-library/intro/), but nothing depends on them.

## A client per test

Create a new client for every test, so no cached data leaks between them. Give it the app's plugins: the app's factories are [bound to its client](./plugins.md#typing-options-by-the-client), so `load` and the verbs run them only on a client that has those plugins.

```sample
tanstack-start/src/docs/testing.tsx#a-client-per-test
```

- `plugins` is what the app's `makeQueryClient` passes, here `recommended()`. A client with other plugins, or none, is a type error where a test hands it an app factory.
- `defaults` turn a behavior off for the tests: with `retry: false`, a failing request fails at once.
- `removeAll` drops every query and aborts requests in flight, so nothing runs after the test ends. Features stop when the `QueryClientProvider` unmounts, which Testing Library's `cleanup` does after each test.
- `isServer: false` makes it a browser client even where `window` isn't defined. See [Server rendering](#server-rendering).

Render inside an awaited, async [`act`](https://react.dev/reference/react/act). A tree that suspends inside a sync `act`, which `render` on its own uses, is never retried by React once its data lands, with or without a Suspense boundary. The same holds for any `use(promise)`, not only raf-query's.

## Testing a component

A component takes a handle as a prop, so a test can start the query itself with `load`, the same way a loader would:

```sample
tanstack-start/src/docs/testing.tsx#testing-a-component
```

## Seeding the cache

To render with known data and no request at all, write it with `setData` before loading:

```sample
tanstack-start/src/docs/testing.ts#seeding-the-cache
```

`swr` resolves at once when the cache has data. It also refetches stale data in the background, and data written with `setData` is fresh only for `staleTime`, which is `0` by default: give the test client a default `staleTime` so the seeded data stays as it is.

## Mocking the network

The `queryFn` is your code, so mock what it calls. With `fetch`, [MSW](https://mswjs.io) intercepts requests without changing application code:

```sample
tanstack-start/src/docs/testing.ts#mocking-the-network
```

## Testing loaders

A loader is a function of its context. Export it from the route file, call it with a client, and check what it started:

```sample
tanstack-start/src/docs/testing.loader-test.ts#testing-loaders
```

`getData` reads what an `swr` or `revalidate` entry loaded, and `isFetching(queryClient, target)` counts the requests still in flight, such as a prefetch's.

## Time

Staleness, garbage collection, retry delays, timeouts and polling depend on time. The client reads it from its `clock`: `now()`, `setTimeout` and `clearTimeout`. Pass your own to `createQueryClient({ clock })`, and a test of `gcTime` or `staleTime` runs in milliseconds, without touching globals:

```sample
tanstack-start/src/docs/testing.ts#time
```

The default clock calls `Date.now()` and `setTimeout` each time, so [`vi.useFakeTimers()`](https://vitest.dev/api/vi.html#vi-usefaketimers) works as well.

## Focus and the network

`focusRefetch()` and `reconnectRefetch()` listen to the page's own events, so a test in a DOM environment fires them. The client needs the plugin, which the test client has through `recommended()`. Render under a `QueryClientProvider` (features only run while one has the client mounted), and dispatch the event:

```sample
tanstack-start/src/docs/testing.tsx#focus-and-the-network
```

`focusRefetch()` refetches on `focus` only while `document.visibilityState` is `"visible"`. For reconnecting, dispatch `new Event("online")`. Retries wait for that event too, while `navigator.onLine` is `false`.

## Server rendering

A client created where `window` isn't defined is a server client: no retries, no garbage collection, and cached data is never revalidated. To test browser behavior in Node without a DOM environment, pass `isServer: false`:

```ts twoslash
import { createQueryClient, recommended } from "@raf-query/react";
// ---cut---
const queryClient = createQueryClient({
	isServer: false,
	plugins: recommended(),
});
```
