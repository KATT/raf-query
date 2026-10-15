# Experiment: raf-query on React Router

Private Framework Mode integration: a state-based `HydrationBoundary` and the same issue tracker as `examples/tanstack-start` and `examples/nextjs`. Not published and not a docs topic yet — the draft guide lives in [`docs/`](./docs/).

| Path       | Package                                | Role                                                 |
| ---------- | -------------------------------------- | ---------------------------------------------------- |
| `package/` | `@raf-query/experimental-react-router` | `HydrationBoundary` over `@raf-query/react`          |
| `app/`     | `@examples/experimental-react-router`  | React Router Framework Mode, <http://localhost:3006> |
| `docs/`    | —                                      | Stashed `www` guide (not linked from the site)       |

```shell
pnpm --filter @raf-query/experimental-react-router test
pnpm --filter @examples/experimental-react-router dev
pnpm --filter @examples/experimental-react-router build
```

The package only uses `@raf-query/react`'s public API (`hydrate`, `useQueryClient`), so it re-implements the split that `@raf-query/react`'s internal `Hydrate` does: new entries before render, entries already on screen after commit.

## Making it real

1. Move `package/src/index.tsx` into `packages/react` as `@raf-query/react/react-router`, built on the shared `Hydrate`, and delete `package/`.
2. Move `app/` to `examples/react-router` and drop the `experimental-` prefix from the package name.
3. Move `docs/react-router.md` into `www/content/` and wire installation / examples / API reference / SSR pages.
4. Add a Vercel project / CodeSandbox copy if the other examples have them.
5. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).
