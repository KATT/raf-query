# Docs build renders each page once (agent)

- `docsContent` keeps a `rendered` Map of Twoslash results and sets `sharedDuringBuild: true`. Without it Vite recreates plugins per environment during build, so client and SSR would each get their own Map.
- `transform` calls `rendered.delete(file)` before a render only when `this.environment.mode === "dev"` (HMR / snippet edits); in a build it would wipe the shared entry when SSR runs after client. `hotUpdate` clears on file change.
- 39 pages take 39 Twoslash renders, not 39 × 3 ≈ 114 with a render per environment, which halves the build (~63s local with the extra renders). Lost: deleting on every transform (forces a re-render per environment).
