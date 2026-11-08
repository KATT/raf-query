# Loaders call `load()`; handles carry no data (human decided)

- A loader starts every query in one call: `load(client, { name: prefetch | swr | revalidate(factory, input) })`. It starts them all before awaiting any, and resolves to `[handles, data]`. Follows KATT/react-query#8.
- A handle is plain serializable data, `{ queryKey, input }`, the same for every entry. The data a loader waited for is `load`'s second element, typed per entry kind.
- `useQuery(factory, handle)` returns a `Thenable` for every handle; see [use-query-thenable.md](./use-query-thenable.md).
- Names: `prefetch` / `swr` / `revalidate`, from HTTP `Cache-Control`; see [load-builder-names.md](./load-builder-names.md).
- A component that needs a query the loader couldn't start uses `waterfallHandle(factory, input)`; a loader with a dependent query calls `load` twice.
- Lost: `qc.prefetch` / `qc.ensure` / `qc.fetch` methods, handles that carry data, and `useWaterfall`.
- Where: `packages/core/src/load.ts`, `packages/react/src/use-query.ts`.
