# The client-only base stays under 5 kB gzip (human asked)

- `pnpm bundle-size` bundles the same small apps with TanStack Query and raf-query. The first app (a factory, a loader `load`, and `useQuery`, with no links, features or hydration) is raf-query's budget: the run fails past 5 kB gzip.
- Other scenarios add paging, an action, server hydration, and the TanStack Router integration with `recommended()`.
- Where: `tooling/bundle-size/src/measure.ts`, `tooling/bundle-size/fixtures/`.
