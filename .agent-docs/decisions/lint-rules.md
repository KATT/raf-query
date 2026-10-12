# Lint rules (human decided)

- Port the strict oxlint setup into this repo: type-aware oxlint with `correctness` + `suspicious`, React Compiler rules, perfectionist, no-only-tests, vendored `anti-slop` / `anti-slop-effect` / `nkzw` plugins, and generic workspace rules. Plugins live in `tooling/oxlint-plugins` and build with `vp pack`.
- **Enabled everywhere, including README examples in spirit:** `workspace/no-overzealous-destructuring` (destructure only when a field is read ≥3 times), no type assertions (`consistent-type-assertions: never`).
- **Dropped on purpose:** `workspace/no-use-state` (README pattern needs `useOptimistic` / `useActionState`), `eslint/max-params` (3-arg APIs like `useQuery(factory, handle, options)`), `workspace/no-optional` (library options are optional). Also not ported: app-specific rules (Convex, react-hook-form, i18n literals, the old prefetch-handle rules).
