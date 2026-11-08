# Hooks are safe under the React Compiler (human asked)

- Apps that compile `@raf-query/react`'s sources (Next.js `transpilePackages` with `reactCompiler: true`, a monorepo) run the hooks through the React Compiler, which memoizes a read on its arguments. An entry object is stable while core swaps its `thenable` on writes, so a read keyed on the entry alone kept the first page (the Next example showed "Showing 10 of 42" with every page fetched).
- **Hooks read an entry through its state snapshot** (human, 2026-11-06): `useQuery` takes `entry.state` from `useSyncExternalStore` and passes it to every read of the entry (`readOf`, `startIfMissing`, and `useInfiniteQuery`'s `hasPage`). Core replaces `state` with every write, together with the thenable, so memoized reads recompute. `useIsFetching` computes inside its snapshot already. The devtools row carries the state it renders.
- Not `"use no memo"`: the root fix costs +0.01 kB on the base; a separate view object cost +0.08 kB.
- No docs note: users have nothing to do.
- Test: `packages/react/src/*.compiler.test.tsx` run through `babel-plugin-react-compiler` (`vitest.compiler.config.ts`, first in the package's `test` script so CI's appended `--coverage` lands on the plain run). They check the hooks compiled, and that a second write and every page render.
