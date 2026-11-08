# Handles of same-signature factories don't mix (human asked; shape agent)

- Human: "make it so query handles on two different factories with the same signature can't be mixed up".
- **`queryOptions` / `infiniteQueryOptions` keep the key's literal type**: a `const TKey extends QueryKey` type parameter, the first of `QueryOptions<TKey, …>`, for group-built and hand-written keys alike. A handle's `queryKey` is typed `KeyOf<F>`, the factory's key type, so `QueryHandle<typeof postQuery>` and `QueryHandle<typeof draftQuery>` differ whenever the keys' shapes differ.
- Reason: TypeScript compares function types structurally, so `typeof factory` alone can't tell two factories with the same input and data apart, and `useQuery(otherFactory, handle)` would read the other factory's entry at runtime. Factories with the same key shape hit the same cache entries, so their handles still mix and that's harmless.
- Gaps, accepted: a factory whose return type is annotated with a wide key, a key built by a helper typed `QueryKey`, and generic makers whose keys differ only by a runtime string (`group(endpoint.name)(args)`).
- Lost: an opt-in `brand` (a `unique symbol` the app declares per factory; `queryOptions` can't mint one per call, TS1335) in PR #168; a required brand or `defineQuery` wrapper, which changes the factory shape the human picked in [public-api.md](./public-api.md); a runtime check in `useQuery` comparing keys (human: "I don't like the idea of runtime checks").
- No type test pins it yet.
- Code: `packages/core/src/options.ts` (`queryOptions`, `KeyOf`), `packages/core/src/load.ts` (`QueryHandle`). Docs: `www/content/reading-queries.md#handles`.
