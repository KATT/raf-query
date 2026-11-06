# Hydration is opt-in and tree-shakes (human decided)

- `dehydrate` and `hydrate` live on the `@raf-query/core/hydration` subpath (re-exported at `@raf-query/react/hydration`). `HydrationBoundary` is on the React main entry and pulls the hydration module only when an app renders it.
- A client-only app bundles none of it: `pnpm bundle-size` measures the client-only base without hydration, and a separate scenario with it.
- Query `meta` isn't dehydrated (it can hold functions). Hydrated entries that nobody has read yet match groups and factories, which live in the key, but not tags or `where` targets until a query reads them.
- Where: `packages/core/src/hydration.ts`, `packages/react/src/hydration-boundary/`, `tooling/bundle-size`.
