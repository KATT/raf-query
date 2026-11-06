# Behaviors are opt-in links and features that declare their `meta` (human decided; typing provisional)

- The kernel does nothing beyond caching. Retries and timeouts are links (`retry()`, `timeout()`), which wrap each request. Refetch on focus or reconnect, polling, groups and cache busting after actions are features (`focusRefetch()`, `reconnectRefetch()`, `polling()`, `groups()`, `invalidateOnAction()`), which watch the client.
- `recommended()` is the preset the docs teach: retry, focus and reconnect refetch, polling and `invalidateOnAction()`. Spread it into `createQueryClient`.
- Per-query settings are `meta` fields declared by the part that reads them (`link<{ meta: RetryMeta }>()`, `feature<{ meta: PollingMeta }>()`), so a query can only set `retry` or `refetchInterval` when its client has the part. The client's meta keys are required but may be `undefined`, and queries pass a `Partial`; otherwise roots with all-optional metas would be assignable to each other.
- The split may be folded into the core later; apps that use `recommended()` shouldn't notice.
- Where: `packages/core/src/client.ts`, `links.ts`, `features.ts`, `presets.ts`, `root.ts`.
