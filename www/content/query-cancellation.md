---
title: Query cancellation
description: Pass the queryFn's AbortSignal to fetch so requests nobody needs any more are aborted, and cancel queries yourself with qc.cancel.
section: Guides
order: 18
---

Every `queryFn` receives an `AbortSignal`. Pass it to `fetch` (or any API that takes a signal), and raf-query can abort the request when its result is no longer needed:

```ts twoslash
import { queryOptions } from "@raf-query/react";
// ---cut---
export function searchQuery(input: { q: string }) {
	return queryOptions({
		queryKey: ["search", input.q],
		queryFn: async (context) => {
			const response = await fetch(
				`/api/search?q=${encodeURIComponent(input.q)}`,
				{
					signal: context.signal,
				},
			);
			return response.json();
		},
	});
}
```

A `queryFn` that ignores the signal still works. Its request just runs to the end, and the result is cached.

## When requests are aborted

raf-query is conservative about aborting, because a result that arrives is usually still worth caching:

- **The last reader leaves during a background refetch.** If the `queryFn` read its `signal`, the request is aborted, and the entry goes back to how it was before it: same data, not fetching. `fetch` callers waiting on it get the cached data.
- **You cancel it** with `qc.cancel`. The entry keeps its data, as below.
- **The entry is removed or cleared** (`remove`, `clear`, `reset`). Its request is aborted, and `fetch` / `ensure` callers reject with an `AbortError`, as an aborted `fetch` would.

Some requests are never aborted for losing their readers:

- **First loads.** A render may be suspended on the result, and it will be needed as soon as anything reads the query again.
- **Requests nothing has read yet**, like a loader's `prefetch`. The component that will read it may not have mounted yet.

These finish so their result is cached, but don't retry on failure unless a reader comes back.

Try it below. The inbox's `queryFn` passes its signal to the server, so aborted requests show up in the Queries panel:

```demo
cancellation
```

## Cancelling yourself

`cancel` aborts requests in flight and keeps the data. It takes a factory and its input, or a [filter](./query-invalidation.md#query-filters), like `invalidate`:

```sample
tanstack-start/src/docs/query-cancellation.ts#cancelling-yourself
```

Each matching entry goes back to how it was before its request: same data, same `updatedAt`, not fetching. `fetch` / `ensure` callers waiting on the request reject with an `AbortError`. The promise `cancel` returns resolves once the requests have stopped. Entries with no request in flight are left alone.

A cancelled first load has no data to go back to, so it stays pending. Renders suspended on it keep waiting, and the next read, `prefetch` or `setData` settles the same promise.

The main use is an [optimistic update in the cache](./mutations.md#optimistic-updates-in-the-cache): cancel before `setData`, or a refetch already in flight lands after your write and replaces it. To drop the data as well, `remove` the entry.

## Effect

An Effect `queryFn` doesn't need the signal: aborting the request interrupts the fiber, which runs its finalizers and interrupts any child work. The signal is still passed, for APIs in the Effect that take one. See [Effect](./effect.md).

## Using axios or other clients

Clients that accept a signal work the same way:

```sample
tanstack-start/src/docs/query-cancellation.ts#using-axios-or-other-clients
```

For clients that take a cancel function instead, call it from an `abort` listener:

```sample
tanstack-start/src/docs/query-cancellation.ts#abort-listener
```
