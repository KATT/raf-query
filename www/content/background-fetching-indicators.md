---
title: Background fetching indicators
description: Show that a query is refreshing with controls.isFetching, count requests in flight with useIsFetching, and leave navigations to the router's pending UI.
section: Guides
order: 17
---

A query's first load suspends, so Suspense fallbacks cover it. Later requests (refetches on focus, invalidation, polling) happen in the background, while the old data stays on screen. Read `isFetching` on that query's controls. For navigations, prefer the router's pending UI: you usually don't need a global fetch counter.

## One query: isFetching

`isFetching` on the reader's controls is `true` while a request for the query is in flight, first loads included:

```sample
tanstack-start/src/docs/background-fetching-indicators.tsx#one-query-isfetching
```

A component that reads `isFetching` re-renders when a request starts and when it ends; one that doesn't read it doesn't ([tracked state](./render-optimizations.md#tracked-state)). Keep the indicator in a small component of its own, and pass the data down to `memo` children (or let [React Compiler](https://react.dev/learn/react-compiler) do it): structural sharing keeps the data's identity across a refetch that changed nothing, so they skip re-rendering.

## Navigations

A navigation is not a background fetch: it's a transition. Use the router's pending state for the navigation itself:

- [TanStack Start](./tanstack-start.md#pending-ui): `pendingComponent` / `pendingMs`, or `useRouterState({ select: (state) => state.isLoading })`
- [Next.js](./react-server-components.md#pending-ui): `useLinkStatus` from `next/link`

`isFetching` covers what happens after the page has rendered.

## useIsFetching

`useIsFetching()` counts the queries with a request in flight, across the whole cache, for one global indicator:

```sample
tanstack-start/src/docs/background-fetching-indicators.tsx#useisfetching
```

Pass a target to count only some queries: a factory, a group, or a tag.

```sample
tanstack-start/src/docs/background-fetching-indicators.tsx#counting-some-queries
```

Outside React, `isFetching(queryClient, target?)` returns the same number.

Refetch the queries below, together or one at a time, and watch both indicators:

```demo
fetching-indicators
```

## Avoiding flashes

On a fast connection, a background refetch can finish in 50 ms, and a spinner that flashes for that long is more distracting than helpful. Delay it with CSS, so it only appears for slower requests:

```css
.spinner {
	animation: fade-in 0s 300ms both;
}

@keyframes fade-in {
	from {
		opacity: 0;
	}
}
```
