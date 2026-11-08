# Typed errors are `fail()` data; `QueryBoundary` is its own package (human decided)

- These live in the PR stacked on #230, not in #230 itself: see [typed-errors-stacked.md](./typed-errors-stacked.md). The bullets below describe that PR.

- A `queryFn` returns `fail({ _tag: "NotFound", … })` for an expected error. It's branded, serializable data, so it survives SSR and hydration. `ErrorOf<F>` types it per factory.
- `useQuery(factory, handle, { result: true })` reads the error inline, in `@raf-query/react`. Unexpected errors (defects) stay untyped and are redacted when dehydrated.
- `QueryBoundary` catches typed errors by `_tag` with handlers typed from the query, in `@raf-query/boundary`. It's complementary, never bundled into core or react. Its catch works on the client; on the server the nearest error boundary handles it.
- A `load` rejects as soon as an `swr` or `revalidate` entry fails: with a `QueryFailure` wrapping a `fail()` value, or the error itself otherwise. `prefetch` entries never make it reject.
- Lost: Effect's typed error channel and `throwOnError` on query options.
- Where: `packages/core/src/fail.ts`, `packages/react/src/use-query.ts`, `packages/boundary/`.
