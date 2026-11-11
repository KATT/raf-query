---
title: Window focus refetching
description: Refetch stale queries on screen when the user comes back to the tab or reconnects, with focusRefetch() and reconnectRefetch(), and opt queries out.
section: Guides
order: 14
---

When the user leaves your app and comes back, the data on screen may be out of date. Two [plugins](./plugins.md) refetch it:

- `focusRefetch()` refetches every **read, stale** query when the window regains focus.
- `reconnectRefetch()` does the same when the browser comes back online.

Neither is on by default. Add them to the client, or pass `recommended()`, which has both:

```sample
tanstack-start/src/docs/window-focus-refetching.ts#the-features
```

Only queries that a component is reading refetch, and only stale ones: data within its `staleTime` stays as it is. With the default `staleTime` of `0`, that's everything on screen.

Both are features: they run while a `QueryClientProvider` has the client mounted, so they only ever run in the browser.

## Turning it off

For every query, leave the plugin out of the client:

```sample
tanstack-start/src/docs/window-focus-refetching.ts#turning-it-off
```

For one query, set `refetchOnWindowFocus: false` or `refetchOnReconnect: false` in its factory. The plugins declare these options, so a factory can set them when its `queryOptions`, the one the app's `raf.ts` [binds to its client](./plugins.md#typing-options-by-the-client), is bound to a client that has them:

```sample
tanstack-start/src/docs/window-focus-refetching.ts#per-query
```

The client's `defaults` take the same options, for every query that doesn't set its own. A long `staleTime` is often the better fix: the data then refetches on focus only once it's actually old.

## What counts as focus

`focusRefetch()` listens for two events:

- the document's [`visibilitychange`](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event) event, when [`document.visibilityState`](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilityState) becomes `"visible"`: switching back to the tab, restoring the window, unlocking the phone;
- the window's [`focus`](https://developer.mozilla.org/en-US/docs/Web/API/Window/focus_event) event, while the page is visible: clicking back into the browser window from another app.

`reconnectRefetch()` listens for the window's [`online`](https://developer.mozilla.org/en-US/docs/Web/API/Window/online_event) event.

To test it by hand, switch tabs and come back. See [Testing](./testing.md#focus-and-the-network) for firing these events in tests.
