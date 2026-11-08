# Origin

`raf-query` = **r**ender-**a**s-you-**f**etch **query**.

Tooling baseline: TypeScript scripts written with Effect and run with plain `node`, Vite+ (`vp`), pnpm workspace, Node ≥24, oxlint/oxfmt, husky + lint-staged, conventional release-it. Stick to these rather than adding parallel tools unless the human says otherwise.

The published packages (`@raf-query/core`, `@raf-query/react`) don't use Effect; Effect is for the scripts and tooling ([decisions/effect-scope.md](./decisions/effect-scope.md)).
