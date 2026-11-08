# Bundle size: one entry per slice of raf-query (human asked)

- `pnpm bundle-size` bundles one small entry per slice of raf-query (`tooling/bundle-size/fixtures/`): core only, + React hooks, then the hooks plus one of hydration, `retry()`, `polling()`, `focusRefetch()`, `reconnectRefetch()`, a paged query, a stream query or `QueryBoundary`; TanStack Query's defaults together (`retry()`, focus and reconnect refetch, `polling()`, hydration); and everything.
- Each row shows its gzip size and the opt-in features found in the bundle. A feature is found by a marker (its module, or a string that survives minification), and the run fails when a bundle holds a feature its entry doesn't import, or lacks one it does: that's the proof unused features tree-shake away.
- Bundled with Vite (Rolldown), minified, React external. `--dist` bundles the built packages after `pnpm build`, which is what npm users get.
- `src/analyze.ts [fixture] [--top N]` lists one fixture's modules by size, largest first. Start there after `measure.ts` shows a change.
- Numbers and what defeats tree-shaking: [bundle-size.md](../bundle-size.md). Budget: [bundle-budget.md](./bundle-budget.md).
