# Hydration is opt-in and tree-shakes (human decided)

- `dehydrate` and `hydrate` live in `core/hydration.ts`, exported from both main entries ([one-entry-point.md](./one-entry-point.md)); nothing in the client, the kernel or `useQuery` imports that module, so apps that don't use them don't bundle it. `HydrationBoundary` pulls the hydration module only when an app renders it.
- A client-only app bundles none of it: `pnpm bundle-size` measures the client-only base without hydration, and a separate scenario with it.
- Query `meta` isn't dehydrated (it can hold functions). Hydrated entries that nobody has read yet match groups and factories, which live in the key, but not `where` targets over `meta` until a query reads them.
- Where: `packages/core/src/hydration.ts`, `packages/react/src/hydration-boundary/`, `tooling/bundle-size`.
