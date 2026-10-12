# Devtools (agent)

- Ship as subpath `@raf-query/react/devtools` (like the integrations), not a separate package. Hand-written React + inline styles: no CSS file, no extra dependency, no Solid core like `@tanstack/query-devtools`.
- Mirrors `@tanstack/react-query-devtools` (`.repos/query/packages/react-query-devtools/src/index.ts`): the default entry swaps in `() => null` when `process.env.NODE_ENV === "production"` so bundlers drop the panel; `/devtools/production` always renders it. We check `=== "production"` (TanStack: `!== "development"`) so tests and dev both get the panel. Verified by grepping both example apps' production builds for a panel-only string. TS 7 doesn't auto-include `@types/node`, so `devtools.tsx` declares `process` locally.
- Renders nothing until hydrated (`useSyncExternalStore` server snapshot `false`): the server's cache isn't the browser's, and `localStorage` state is read in the client-only child's `useState` initializer.
- Cache events fire synchronously, sometimes during another component's render, so `devtools-store.ts` notifies React in a microtask and caches the row snapshot per event version.
- Core gained what the panel needs: `Query.observerCountUnsafe`, `Query.isStaleUnsafe`, `Query.reset`, `reset` / `remove`, and the `observers` cache event (subscribe/unsubscribe don't otherwise emit). A suspended reader isn't counted until it commits.
