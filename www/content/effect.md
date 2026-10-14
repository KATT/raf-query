---
title: Using Effect
description: The cache is written in Effect. Return Effects from queryFns for typed errors and interruption, and use the cache, entries and observers as Effect data types.
section: Effect
order: 1
---

raf-query's cache is written in [Effect](https://effect.website). Using raf-query doesn't take any Effect: `queryFn`s return promises, and `QueryClient`, the hooks and the integrations speak promises. Apps that do use Effect get the same cache as Effects, with typed errors and [services](./effect-services.md).

`effect` (`^4.0.0`) is a peer dependency of both packages, so an app that uses Effect shares one copy with raf-query.

## Effect queryFns

A `queryFn` can return an `Effect`:

```ts twoslash
import { Schedule } from "effect";
import { IssueRepo } from "~/issues.ts";
// ---cut---
import { queryOptions } from "@raf-query/react";

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueRepo.get(input.id), // Effect<Issue, IssueNotFound>
		retry: Schedule.exponential("200 millis").pipe(Schedule.upTo({ times: 3 })),
	});
}
```

- **Typed errors.** The Effect's error type is the query's: `qc.effect.fetch(issueQuery, input)` fails with `IssueNotFound | Query.CancelledError`. `ErrorOf<TFactory>` names it; it's `unknown` for promises.
- **Defects aren't retried.** A `queryFn` that throws instead of returning, or an Effect that dies, is a defect: it fails the request without retrying.
- **Interruption.** Cancelling the request interrupts the fiber, so its finalizers run. No `AbortSignal` needed.
- **Schedules.** `retry` accepts a `Schedule` as well as a count or predicate.

From React, nothing changes: `useQuery` and the client's Promise methods read an Effect query like any other.

## The cache as an Effect service

`QueryClient` is a Promise wrapper around a `QueryCache` service, available as `qc.effect`. Effect code uses the cache directly, or builds its own with `QueryCache.make(config)` (scoped: closing the scope interrupts every request and timer) or `QueryCache.layer(config)`:

```ts twoslash
import { Effect } from "effect";
import { issueQuery } from "~/issues.ts";
// ---cut---
import { QueryCache } from "@raf-query/core";
import { Stream } from "effect";

const program = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	const issue = yield* cache.fetch(issueQuery, { id: 1 });
	yield* cache.watch(issueQuery, { id: 1 }).pipe(
		Stream.map((state) => state.data?.title),
		Stream.runForEach((title) => Effect.log(title)),
	);
});

Effect.runFork(program.pipe(Effect.provide(QueryCache.layer())));
```

`qc.effect` has every verb as an Effect: `prefetch`, `ensure`, `fetch`, `invalidate`, `reset`, `remove`, `setData`, `getData` (an `Option`), `isFetching` (a count), `dehydrate` and `hydrate`. `watch` is a `Stream` of an entry's state, and `events` a `Stream` of cache events.

`watch` counts as a reader while it runs, so invalidation and window focus refetch the entry. Outside React, `cache.mount` (`Effect<void, never, Scope>`) refetches read, stale entries on window focus and reconnect while its scope is open.

## Entries and observers

Entries are a data type with module functions, like Effect's own modules:

```ts twoslash
import { Effect } from "effect";
import { issueQuery } from "~/issues.ts";
// ---cut---
import { Query, QueryCache } from "@raf-query/core";

const program = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	const query = yield* cache.getQuery(issueQuery, { id: 1 });
	yield* Query.fetch(query);
	yield* Query.invalidate(query);
	return Query.getUnsafe(query); // synchronous read
});
```

`Query.changes(query)` streams the entry's state, and `Query.subscribeUnsafe(query, listener)` is the synchronous version.

`QueryObserver` is one reader's view of a query, as `useQuery` sees it: the controls and the promise, with `whilePending`, `refetchInterval` and the focus and reconnect options. `QueryObserver.make(query, options)` creates one, and `QueryObserver.changes(observer)` streams its results. While it runs, the query counts as read and polls on `refetchInterval`. It's the building block for bindings to other frameworks.

## SSR streaming

The SSR integrations are thin wrappers over Effect APIs:

- `dehydrateStream(options)` (scoped) returns the cache's `initial` state and a `Stream` of `updates`: entries that start or settle later, each sent once, batched per microtask. The stream ends when the scope closes.
- `hydrateStream(stream)` hydrates each state as it arrives.
- `Stream.toReadableStream` and `Stream.fromReadableStream` carry it over a web stream.

The `sent` option (a `Set` of hashes) makes separate `dehydrate` calls of one request skip entries already sent.

## Time and the page

Time comes from Effect's `Clock`, and the page from the `Platform` service (focus, visibility, `navigator.onLine`; the default reads the globals). Provide `TestClock` or another `Platform` to test staleness, garbage collection and offline retries without a browser. See [Testing](./testing.md).
