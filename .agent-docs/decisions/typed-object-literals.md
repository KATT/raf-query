# Typed object literals (human decided)

- Alex (2026-11-07): never bind an object literal to a variable without `: Type` or `satisfies X`; the trigger was an untyped `where` target on `/docs/query-invalidation#matching-with-where`, which reads `const mentionsPost: Target<object, string> = { … }`.
- Use a type the package exports, exporting it if it isn't. Literals passed straight to a call are typed by the parameter and stay inline.
- `workspace/no-untyped-object-literal` (`tooling/oxlint-plugins/`) flags a variable bound to `{ … }` or `{ … } as const` with neither; `as const satisfies X` passes. It runs on examples, `www/samples`, `www/src/demos`, tests (`*.test.*`, `*.test-d.*`, `test-utils.*`) and, through its test, Markdown fences. Library source and tooling aren't in scope (human scoped it to what readers copy).
- Prefer `satisfies Record<…>` to annotating an open dictionary: `anti-slop/no-known-value-widening` rejects the annotation.
