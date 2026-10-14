---
title: Testing
description: Test components and loaders that use raf-query with a fresh client per test, seeded data, a fake clock and a fake page.
section: Guides
order: 21
---

Components that read queries need a `QueryClient` and handles. In tests, create both directly. There's nothing to mock in raf-query itself: mock your API, or seed the cache.

## A client per test

Create a new client for every test, so no cached data leaks between them. Turn retries off, or a failing request takes seconds to fail:

<<< ./testing/src/render-with-client.tsx#client

`dispose()` interrupts in-flight requests and timers, so nothing runs after the test ends.

Render inside an awaited, async `act`. A tree that suspends inside a sync `act`, which `render` on its own uses, is never retried by React once its data lands, with or without a Suspense boundary. The same holds for any `use(promise)`, not only raf-query's.

## Testing a component

A component takes a handle as a prop, so a test can start the query itself, the same way a loader would:

<<< ./testing/src/component-test.tsx#component

For an `EnsuredQueryHandle`, `await queryClient.ensure(...)` instead.

## Seeding the cache

To render with known data and no request at all, write it with `setData` before rendering:

<<< ./testing/src/seed-cache.ts#seed

Data written with `setData` is fresh, so `ensure` resolves at once without calling the `queryFn`.

## Mocking the network

The `queryFn` is your code, so mock what it calls. With `fetch`, [MSW](https://mswjs.io) intercepts requests without changing application code:

<<< ./testing/src/msw-example.ts#msw

## Testing loaders

A loader is a function of its context. Call it with a client, and check what it started:

<<< ./testing/src/loader-test.ts#loader

## Time, focus and the network

Staleness, garbage collection, retries and polling depend on time; focus refetching and offline retries depend on the page. raf-query reads both from Effect services, so a test can replace them instead of mocking globals:

- **Time** comes from Effect's `Clock`. Use `TestClock` to move time forward instantly.
- **The page** comes from the `Platform` service: whether it's visible, whether it's online, and its focus and reconnect events.

<<< ./testing/src/fake-platform.ts#platform

With a fake clock, a test of `staleTime` or `gcTime` runs in milliseconds. [`@effect/vitest`](https://effect.website/docs/testing/vitest/)'s `it.effect` provides `TestClock`:

<<< ./testing/src/gc-test.ts#gc

In a plain Vitest test without Effect, `vi.useFakeTimers()` also works: the default clock reads `Date.now()` and schedules with `setTimeout`.

## Server rendering

A client created where `window` isn't defined behaves as a server client: no retries, no garbage collection, cached data never stale. To test browser behavior in Node without a DOM environment, pass `isServer: false`:

<<< ./testing/src/is-server.ts#is-server
