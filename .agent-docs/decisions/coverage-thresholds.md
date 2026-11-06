# 100% coverage, enforced per package (human asked)

- Every shipped package (`packages/core`, `packages/react`, `packages/boundary`) sets `coverage.thresholds` to 100 for `lines`, `branches`, `functions` and `statements` in its `vite.config.ts` (Alex, 2026-11-06).
- `coverage.include` is `src/**/*.{ts,tsx}`, so a source file no test loads still counts (at 0%). `coverage.exclude` is the tests (`*.test.*`, `*.test-d.*`) and `test-utils`, the same files `tsconfig.no-node.json` leaves out of the shipped sources.
- CI's Test job runs `pnpm test --coverage`; a package below 100% fails it. Coverage isn't on by default in the configs, so a filtered local run (`vp test src/x.test.ts`) doesn't trip the thresholds.
- `@raf-query/react`'s React Compiler run (`vitest.compiler.config.ts`) has no coverage: compiled code has branches of its own. It runs first in the package's `test` script, so the appended `--coverage` lands on the plain run.
