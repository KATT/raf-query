# Loaders call `load()`; handles carry no data (human decided)

- A loader starts every query in one call: `load(client, { name: prefetchEntry | ensureEntry | fetchEntry(factory, input) })`. It starts them all before awaiting any, and resolves to `[handles, data]`. Follows KATT/react-query#8.
- A handle is plain serializable data, `{ queryKey, input }`, plus `defined: true` for fetch and ensure entries.
- `useQuery(factory, handle)` returns a `Thenable` for a prefetch handle (read it with `use()`), and the data itself for a defined handle, suspending only if the cache lost the entry. The runtime `defined` marker is what lets it tell the two apart after serialization.
- Names: `prefetchEntry` / `ensureEntry` / `fetchEntry`. Short `prefetch` / `fetch` lost because `fetch` shadows the global.
- A component that needs a query the loader couldn't start uses `waterfallHandle(factory, input)`; a loader with a dependent query calls `load` twice.
- Lost: the `qc.prefetch` / `qc.ensure` / `qc.fetch` methods, handles that carry data, and `useWaterfall`.
- Where: `packages/core/src/load.ts`, `packages/react/src/use-query.ts`.
