# Experiment: raf-query on React Router

Private Framework Mode app: the same issue tracker as `examples/tanstack-start` and `examples/nextjs`, using `@raf-query/react/react-router`'s state-based `HydrationBoundary`. Not a first-class docs topic yet — draft guide lives in [`docs/`](./docs/).

| Path    | Package                               | Role                                                 |
| ------- | ------------------------------------- | ---------------------------------------------------- |
| `app/`  | `@examples/experimental-react-router` | React Router Framework Mode, <http://localhost:3006> |
| `docs/` | —                                     | Stashed `www` guide (not linked from the site)       |

```shell
pnpm --filter @examples/experimental-react-router dev
pnpm --filter @examples/experimental-react-router typecheck
pnpm --filter @examples/experimental-react-router build
```

`@raf-query/react/react-router` stays in the publishable package (small `HydrationBoundary` over shared `Hydrate`); this folder is the app and the draft docs until the integration is ready to ship.

## Making it real

1. Move `app/` to `examples/react-router` and drop the `experimental-` prefix from the package name.
2. Move `docs/react-router.md` into `www/content/` and wire installation / examples / API reference / SSR pages.
3. Add a Vercel project / CodeSandbox copy if the other examples have them.
4. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).
