# Every public export's JSDoc links to its docs page (human)

Human: "make it so all public apis have a link that is linked to the docs".

- **`workspace/require-docs-link`** (`tooling/oxlint-plugins/require-docs-link.ts`) runs on the public entry files listed in the `.oxlintrc.json` override (each path in a package's `exports` but `@raf-query/core/internal`). It follows every exported name (`export … from`, `export *`, `import` then `export { x }`) through the package's own modules to the declaration, and fails unless its JSDoc has an `@see https://raf-query.katt.dev/docs/<page>[#anchor]`.
- The page must be a file in `www/content` and the anchor an `h2` / `h3` id on it (slugged with `github-slugger`, as `www/build/markdown.ts` does), so renaming a page or heading fails lint until the links follow.
- Errors point at the entry file's export, and name the file that declares it. Other packages' re-exports (`export * from "@raf-query/core"`) are left to that package's entry.
- Oxlint's `jsdoc` plugin has no `require-jsdoc` or link rule, hence the workspace rule. When adding an entry point to a package's `exports`, add it to the override's `files`.
- Link the guide that teaches the export, with an anchor when one section covers it; `api-reference#…` only when no guide does (`QueryClient`, `QueryOptions`, `getData`, `useQueryClient`). The react-server hooks link `react-server-components`.
