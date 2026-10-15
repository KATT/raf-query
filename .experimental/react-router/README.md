# Experiment: raf-query on React Router

The issue tracker from `examples/tanstack-start` and `examples/nextjs` on React Router Framework Mode, using `HydrationBoundary` from `@raf-query/react/react-router`. Not a docs topic yet — the draft guide lives in [`docs/`](./docs/).

| Path    | Package                               | Role                                                 |
| ------- | ------------------------------------- | ---------------------------------------------------- |
| `app/`  | `@examples/experimental-react-router` | React Router Framework Mode, <http://localhost:3006> |
| `docs/` | —                                     | Stashed `www` guide (not linked from the site)       |

```shell
pnpm --filter @examples/experimental-react-router dev
pnpm --filter @examples/experimental-react-router build
```

## Making it real

1. Move `app/` to `examples/react-router` and drop the `experimental-` prefix from the package name.
2. Move `docs/react-router.md` into `www/content/` and wire installation / examples / API reference / SSR pages.
3. Add a Vercel project / CodeSandbox copy if the other examples have them.
4. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).
