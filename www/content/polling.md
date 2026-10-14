---
title: Polling
description: Refetch a query on an interval while it's on screen with refetchInterval, and pause while the tab is hidden.
section: Guides
order: 16
---

`refetchInterval` refetches a query every so many milliseconds while a component is reading it. It's an option of the read, not of the query, because it's the screen that knows it needs live data:

```tsx twoslash
import { type QueryHandle, useQuery } from "@raf-query/react";
import { buildQuery } from "~/queries.ts";
// ---cut---
function BuildStatus(props: { handle: QueryHandle<typeof buildQuery> }) {
	const [buildPromise, build] = useQuery(buildQuery, props.handle, {
		refetchInterval: 2000,
	});
	// ...
}
```

- Polling starts when the component mounts and stops when it unmounts.
- Each reader polls on its own timer. Requests are deduped, so a poll that lands while another request for the query is in flight joins it instead of starting a second one.
- Ticks while the page is hidden are skipped. When the page becomes visible again, [window focus refetching](./window-focus-refetching.md) catches up on stale data, and polling carries on.
- Changing the interval restarts the timer.

Each poll is a background refetch: the data on screen stays put, and only re-renders if something changed. Structural sharing keeps a response equal to the current data from re-rendering anything at all.

```demo
polling
```

## Changing the interval

The interval is a plain value read on every render, so you can change it with state. Pass `undefined` to stop polling, for instance once the data says there's nothing left to wait for:

```tsx twoslash
import { type QueryHandle, useQuery } from "@raf-query/react";
import { buildQuery } from "~/queries.ts";
declare const props: { handle: QueryHandle<typeof buildQuery> };
declare const buildState: "pending" | "running" | "done" | "failed";
// ---cut---
const [buildPromise, build] = useQuery(buildQuery, props.handle, {
	refetchInterval: buildState === "running" ? 1000 : undefined,
});
```

## Polling and staleTime

Polling refetches whatever the data's `staleTime`: the interval is an explicit request for fresh data. Keep `staleTime` meaningful anyway, because other readers of the same query, without an interval, rely on it.

## Polling outside React

Outside components, a `QueryObserver` with `refetchInterval` polls while it's running. See [Effect](./effect.md).
