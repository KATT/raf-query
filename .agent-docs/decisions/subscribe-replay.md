# client.subscribe can replay the cache (agent)

- `client.subscribe(listener, { signal, replay: true })` sends an `added` event for every entry already cached, right after subscribing, then the usual events. Nothing is replayed for an aborted `signal`. Lives in `createQueryClient` (`client.ts`); the kernel's `Listeners` stay `subscribe(listener, { signal })` ([kernel-subscribe.md](./kernel-subscribe.md)).
- Why: a feature that keeps entries in sync with something else (say, one that holds a server subscription per cached entry) starts after a provider mounts, when hydration may already have filled the cache. Without a replay it read `client["~entries"]`, an internal field.
- Lost: a public `entries(client)` verb (a second way to read the cache, and its result is stale the moment events arrive), and replaying in every `subscribe` (the devtools and dehydration streams snapshot on their own).
- Tests: `packages/core/src/client.test.ts` ("start with every cached entry for a subscriber that asks to replay them"). Docs: `api-reference.md`.
