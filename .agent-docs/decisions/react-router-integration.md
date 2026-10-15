# React Router Framework Mode integration (human asked)

Human: first-class React Router integration; later: keep it under `.experimental/` for now, stash www docs there, and don't touch `packages/**`.

- **`@raf-query/experimental-react-router`** (`.experimental/react-router/package`) exports a state-based `HydrationBoundary`. Loaders create a per-request `QueryClient`, start queries, `dehydrate`, and return that state; the route component wraps its tree in the boundary. There is no `setupRouterIntegration`: React Router has no dehydrate/hydrate hooks on the router itself.
- The package builds on `@raf-query/react`'s public `hydrate` / `useQueryClient`, so it copies the internal `Hydrate`'s split (new entries before render, entries on screen after commit). Shipping it means moving it to `@raf-query/react/react-router` over the shared `Hydrate`.
- Pending entries cross as promises when Single Fetch serializes them. Nested boundaries are fine.
- **`.experimental/react-router/`** also holds the app (`app/`, `@examples/experimental-react-router`, port 3006) and a draft guide (`docs/react-router.md`) not linked from `www`. Layout matches other experiments under `.experimental/<topic>/`.
- Lost for now: shipping docs on the site, CodeSandbox / Vercel catalog rows, a homepage third mode for React Router samples.
