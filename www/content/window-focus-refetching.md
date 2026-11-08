---
title: Window focus refetching
description: Refetch stale queries on screen when the user comes back to the tab or reconnects, with the focusRefetch() and reconnectRefetch() features, and opt queries out in meta.
section: Guides
order: 14
---

When the user leaves your app and comes back, the data on screen may be out of date. Two features refetch it:

- `focusRefetch()` refetches every **read, stale** query when the window regains focus.
- `reconnectRefetch()` does the same when the browser comes back online.

Neither is on by default. Add them to the client, or spread `recommended()`, which has both:

```sample
tanstack-start/src/docs/window-focus-refetching.ts#the-features
```

Only queries that a component is reading refetch, and only stale ones: data within its `staleTime` stays as it is. With the default `staleTime` of `0`, that's everything on screen.

Features run while a `QueryClientProvider` has the client mounted, so they only ever run in the browser.

## Turning it off

For every query, leave the feature out of the client:

```sample
tanstack-start/src/docs/window-focus-refetching.ts#turning-it-off
```

For one query, set `meta: { refetchOnWindowFocus: false }` or `meta: { refetchOnReconnect: false }` in its factory. The features declare these fields, so a factory built with a bound `queryOptions` gets them typed only when the root has the feature: see [Query meta](./links-and-features.md#typing-meta-by-its-root).

```sample
tanstack-start/src/docs/window-focus-refetching.ts#per-query
```

A long `staleTime` is often the better fix: the data then refetches on focus only once it's actually old.

## What counts as focus

`focusRefetch()` listens for two events:

- the document's [`visibilitychange`](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event) event, when [`document.visibilityState`](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilityState) becomes `"visible"`: switching back to the tab, restoring the window, unlocking the phone;
- the window's [`focus`](https://developer.mozilla.org/en-US/docs/Web/API/Window/focus_event) event, while the page is visible: clicking back into the browser window from another app.

`reconnectRefetch()` listens for the window's [`online`](https://developer.mozilla.org/en-US/docs/Web/API/Window/online_event) event.

To test it by hand, switch tabs and come back. See [Testing](./testing.md#focus-and-the-network) for firing these events in tests.
