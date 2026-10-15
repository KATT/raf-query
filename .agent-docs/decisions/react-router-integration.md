# React Router Framework Mode integration (human asked)

Human: first-class React Router integration; later: keep it under `.experimental/` for now and stash www docs there.

- **`@raf-query/react/react-router`** exports a state-based `HydrationBoundary` (wraps the shared `Hydrate`). Loaders create a per-request `QueryClient`, start queries, `dehydrate`, and return that state; the route component wraps its tree in the boundary. There is no `setupRouterIntegration`: React Router has no dehydrate/hydrate hooks on the router itself.
- Reuses `dehydrate` / `hydrate` from core. Pending entries cross as promises when Single Fetch serializes them. Nested boundaries are fine.
- **`.experimental/react-router/`** holds the app (`app/`, `@examples/experimental-react-router`, port 3006) and a draft guide (`docs/react-router.md`) not linked from `www`. Layout matches other experiments under `.experimental/<topic>/`.
- Lost for now: shipping docs on the site, CodeSandbox / Vercel catalog rows, a homepage third mode for React Router samples.
