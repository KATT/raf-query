# Devtools (agent)

- Ship on `@raf-query/react`'s main entry ([one-entry-point.md](./one-entry-point.md)), not a separate package; unused, it tree-shakes away. Hand-written React + inline styles: no CSS file, no extra dependency, no Solid core like `@tanstack/query-devtools`.
- The entry always exports the real panel. Apps tree-shake at the call site (parent agent, 2026-10-14): Vite / TanStack Start use `import.meta.env.DEV`; Next.js uses `process.env.NODE_ENV !== "production"`. There is no `/devtools/production` entry. Example apps and the docs demos always render the panel so it stays available when deployed.
- The panel reads the kernel through `@raf-query/core/internal` (entries and their readers, `loadsOf`, and `reset` / `remove` / `fetchEntry` for its buttons), not the public API.
- Where: `packages/react/src/devtools.tsx`.
