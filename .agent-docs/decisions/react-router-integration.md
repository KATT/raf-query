# React Router Framework Mode integration (human asked)

Human: first-class React Router integration; then: keep it under `.experimental/`; then: release it for real.

- **`@raf-query/react/react-router`** exports a state-based `HydrationBoundary` over the shared `Hydrate` (`packages/react/src/react-router.tsx`). Loaders create a per-request `QueryClient`, start queries, `dehydrate`, and return that state; the route component wraps its tree in the boundary. There is no `setupRouterIntegration`: React Router has no dehydrate/hydrate hooks on the router itself. The entry doesn't import `react-router`, so it adds no peer.
- Pending entries cross as promises when Single Fetch serializes them. Nested boundaries are fine.
- **`examples/react-router`** (`@examples/react-router`, port 3006) is the issue tracker a fourth time, with a CodeSandbox copy like the others. `.experimental/react-router/` still holds the draft guide (`docs/react-router.md`) until it moves to `www/content/`.
- Lost: a separate `@raf-query/experimental-react-router` package (it had to copy `Hydrate`'s split, since `Hydrate` isn't public).
