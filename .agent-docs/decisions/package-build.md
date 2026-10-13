# Packages build with tsc (agent, human asked)

- Human: minimise bundle size. **Packages build with `tsc -p tsconfig.build.json`**, not `vp pack`.
- Why: rolldown (`vp pack` / tsdown) compiles `export * as X` to an `__exportAll` getter object that keeps the whole namespace, so `dist/` bundled ~0.4 kB bigger than src. `tsc` keeps it an ESM re-export, as effect's own `dist/` does.
- `dist/` files are `.js` / `.d.ts`, one per source module; `"use client"` directives are kept. `tsconfig.build.json` excludes tests and `test-utils.ts`.
- Lost: named exports instead of the `export * as` namespaces would also have fixed it, but change the Effect-style API; post-processing `dist/` is fragile, since rolldown has no option to keep namespace re-exports.
- Check with `pnpm build && pnpm bundle-size --dist`.
