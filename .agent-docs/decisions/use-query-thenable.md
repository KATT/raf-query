# `useQuery` returns a thenable for every handle (human decided)

- Alex (2026-11-07): `const [postThenable, postState] = useQuery(postQuery, handle)`, then `const post = use(postThenable)` on its own line ([use-on-own-line.md](./use-on-own-line.md)), whatever entry made the handle.
- Why: the cache can always be purged between the loader and the render (gc while the router keeps loader data, `resetOne` / `removeOne`), so a handle from `swr` or `revalidate` can't promise data. Returning the data itself had to suspend inside the hook in that case anyway, and it gave one hook two return shapes, so switching a loader's entry kind broke its components.
- There is no `DefinedQueryHandle` and no `defined` flag. What a loader waited for is `load`'s second element (`LoadedData`, per entry kind), not the handle.
- A waited-for handle's thenable is already fulfilled, so `use()` returns synchronously with no fallback. Streams and infinite pages replace the thenable on each write, `whilePending: "previous"` returns the previous entry's, and reads still take the state snapshot ([compiler-safe-hooks.md](./compiler-safe-hooks.md)), so none of them changed.
- Naming (human): the first slot is `xThenable` and the second `xState` in docs, samples, examples and tests. Not `xPromise` or `xRead`.
- Lost: one-line reads of data a loader waited for. Bundle: −0.03 kB on the base (React hooks 4.33 → 4.30 kB gzip).
- Tests: `use-query.test.tsx` ("reads a loaded handle without suspending, and suspends again once the cache dropped it"; "reads without suspending by switching on the thenable's status").
