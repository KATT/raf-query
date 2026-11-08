# The kernel is promises plus one internal `subscribe` (human decided)

- The cache is our own small kernel, not TanStack's `query-core`: entries, deduped requests, lazy staleness, gc, verbs and thenables.
- Every subscription is `subscribe(listener, { signal })`, tRPC style: unsubscribe by aborting the signal or calling what it returns. No error channel (errors live in entry state), no operators, no Observable.
- Why: native `Observable` ships only in Chromium, so a ponyfill would cost every other browser and runtime a round trip or bytes before first render.
- Staleness is computed when an entry is read, from its `updatedAt`, `staleTime` and the latest invalidation stamp, so there are no per-entry stale timers.
- Lost: a native `Observable` source; an Observable can be adapted at the edge into an async iterable stream.
- Where: `packages/core/src/subscribe.ts`, `entry.ts`, `client.ts`.
