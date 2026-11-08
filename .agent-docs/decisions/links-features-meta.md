# Behaviors are opt-in links and features that declare their `meta` (human decided)

- The kernel does nothing beyond caching. Retries and timeouts are links (`retry()`, `timeout()`), which wrap each request. Refetch on focus or reconnect and polling are features (`focusRefetch()`, `reconnectRefetch()`, `polling()`), which watch the client. A feature without a setup function only declares `meta` fields, which is how an app writes tags ([tags-userland.md](./tags-userland.md)).
- `recommended()` is the preset the docs teach: retry, focus and reconnect refetch, and polling. Spread it into `createQueryClient`. Which preset is the default (A/B/C) is open ([open-questions.md](../open-questions.md)).
- Per-query settings are `meta` fields declared by the part that reads them (`link<{ meta: RetryMeta }>()`, `feature<{ meta: PollingMeta }>()`), so a query can only set `retry` or `refetchInterval` when its client has the part. The client's meta keys are required but may be `undefined`, and queries pass a `Partial`; otherwise roots with all-optional metas would be assignable to each other. Factories get the root's `meta` from builders bound once per app ([bound-builders.md](./bound-builders.md)).
- The split may be folded into the core later; apps that use `recommended()` shouldn't notice.
- Where: `packages/core/src/client.ts`, `links.ts`, `features.ts`, `presets.ts`, `root.ts`.
