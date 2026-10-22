# Docs demos show compiler output precomputed at build time (human asked, agent designed)

- Human: the effect-query page's live demo should show off its type errors: switches that reconfigure the running boundaries and show the code with the real `tsc` diagnostics (squiggles, messages) and `^?` types, every combination precomputed with the real compiler, the output committed, `typecheck` and `build` failing when it's stale, no TypeScript in the browser, readable on narrow screens.

Agent decisions:

- **A pure `configs.ts` is the source of both sides.** It names the switches, maps a combination to its chain (`layoutOf`) and to the module it stands for (`codeOf`). The runtime builds the chain from `layoutOf`; `build/effect-query-configs.ts` compiles `codeOf` for every combination. `configs.ts` has no imports so the Node script can run it.
- **The code compiles inside the docs sample app** (`www/samples/effect-query`), as virtual files in one TypeScript `LanguageService` over the sample's `tsconfig.json`, so it type-checks against the same `boundaries.tsx`, `queries.ts` and `fallbacks.tsx` the page's twoslash blocks show. Uses `typescript6` (the JS API), like twoslash.
- **The JSON is interned and diff-friendly**: highlighted lines (shiki tokens, both themes) and message texts appear once, each combination is a row of indices, one entry per line. Absolute paths are scrubbed, so it is the same on every machine. `**/*.gen.json` is out of `fmt`.
- **The panel reuses twoslash's rich-renderer classes** (`twoslash-error`, `twoslash-error-line`, `twoslash-query-line`) so it looks like the page's code blocks. It wraps instead of scrolling (`.code-wrap`), so an error reads in place on a phone.
- **Every combination runs**, with the hooks' and `catchErrors`' types erased by SAFETY casts. A banner says when it doesn't compile; then the runtime shows what the compiler stops (reading `.title` off an `Unhandled` renders nothing, a missing `Match` case throws).
- **Hooks stay static for the React Compiler**: module-level hooks read the switches' store and dispatch to the chain's hook; the app remounts (`key={idOf(config)}`) when the switches change, so each mount calls the same hook every render. Each boundary is made once per path from the root, so a boundary is never reused under a different parent.
