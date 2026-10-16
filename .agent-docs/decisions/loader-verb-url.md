# The examples put the loader verb in the URL (human)

- Human: let the examples switch between the three ways a loader starts a query — "it's about ensure/prefetch/fetch", not REST vs RPC — by putting the choice in the URL (`/prefetch/issues`, `/ensure/issues/3`, `/fetch/issues/3`).
- **Why the URL**: the verb is what the examples exist to show, so it is shareable, survives a reload, and SSR renders with it. A cookie setting would hide it.
- **Shape**: the verb is a route segment above `issues` (TanStack Start: `src/routes/$verb/route.tsx`), validated with `LoaderVerb` from `@examples/db`; an unknown verb is a not-found. Each loader calls `startQuery(qc, verb, factory, ...)`, which returns a `QueryHandle` for `prefetch` and a promise of a `QueryHandleWithData` otherwise. Readers call `useQueryData`, which reads the data straight off a handle with data and `use()`s the promise otherwise, so each component works under every verb.
- Bare `/issues/...` and `/` redirect to `/${DEFAULT_LOADER_VERB}/...` (`prefetch`), keeping the search, so old links and the live sites' entry still work.
- TanStack Start needs `defaultStaleReloadMode: "blocking"`: without it a revisit shows the last loader data and reloads in the background, so `fetch` never visibly waits.
- On a server with a per-request client the cache is empty, so `ensure` and `fetch` wait for the same thing on a full page load; they differ only on client navigations.
- Rolled out one app per stacked PR, TanStack Start first. The verify-examples feature map (`features/loader-verb.md`) says which apps have the bar.
