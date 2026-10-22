# Experiment: typed error boundaries for Effect Atom

Private package: raf-query's typed error boundaries (`createErrorBoundary`, a chain of boundaries that each own some errors) on [Effect Atom](https://github.com/Effect-TS/effect/tree/main/packages/atom/react), with no raf-query engine. Atom's registry already caches each atom's `AsyncResult`, so a read narrows the cached result during render and nothing is cached per boundary. Not published; version stays `0.0.0`.

| Path       | Package                        | Role    |
| ---------- | ------------------------------ | ------- |
| `package/` | `@raf-query/experimental-atom` | Library |

```shell
pnpm --filter @raf-query/experimental-atom test
pnpm --filter @raf-query/experimental-atom typecheck
```

See [package/README.md](./package/README.md) for the API.

## Making it real

1. Move `package/` to `packages/atom` (or the chosen public name), drop the `experimental-` prefix, and give it the published fields the other packages have (`files`, `publishConfig`, `prepack`, `publish:npm`) and the lockstep version.
2. Add it to `.release-it.json`'s publish list, the CI pack-and-import check and npm trusted publishers.
3. Add a docs page and list the package in the README, overview, installation page and API reference.
4. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).
