# SSR streaming in core (agent, human asked)

- **`dehydrateStream(client, options): { initial, updates, close }`** in `@raf-query/core` (`hydration.ts`), with `hydrate` as the receiving end. It snapshots and subscribes in one synchronous step, so no change falls between them; `updates` is a `ReadableStream` that ends on `close()`, after flushing the pending batch. It's a record rather than one stream because the router needs `initial` synchronously, in its dehydrated state.
- **Batches are handed over within the microtask**: changed entries collect for a microtask, then are enqueued, so they reach the stream before React streams the boundaries those entries unblock.
- **"Each entry once" is the `sent` option** (`Set<string>` of hashes) on `DehydrateOptions`. `dehydrateStream` uses one internally. The react-server `HydrationBoundary` keeps one set per request client, so each boundary skips what earlier ones sent.
- **Redacted errors are `RedactedError`** (`name`, `hash`, message `Query <hash> failed on the server`). After serialization the browser sees a plain `Error` with those fields.
- The router's browser half logs a failed stream read with `console.error`.
- Where: `packages/core/src/hydration.ts`, `packages/react/src/hydration-boundary/`, `packages/react/src/tanstack-router-shared.ts`.
