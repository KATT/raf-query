# Experiment: raf-query on Vue

Private Vue 3.5 bindings over `@raf-query/core`: composables (`useQuery`, `useWaterfall`, `useIsFetching`), `QueryPlugin` / `QueryClientProvider`, and `HydrationBoundary`, built on core's `QueryBinding`. Not published and not a docs topic yet — the draft guide lives in [`docs/`](./docs/).

| Path       | Package                          | Role                                                                            |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------- |
| `package/` | `@raf-query/experimental-vue`    | The bindings                                                                    |
| `sample/`  | `@examples/experimental-vue`     | The Vue app (Vue Router, SSR entries) the guide's code is taken from            |
| `app/`     | `@examples/experimental-vue-app` | The example issue tracker on Vue Router and shadcn-vue, <http://localhost:3008> |
| `docs/`    | —                                | Stashed `www` guide (not linked from the site)                                  |

```shell
pnpm --filter @raf-query/experimental-vue test
pnpm --filter @examples/experimental-vue typecheck   # vue-tsc
pnpm dev:vue                                         # the issue tracker, on :3008
pnpm --filter @examples/experimental-vue-app typecheck
```

`app/` matches the four React apps screen for screen (the [verify-examples](../../.agents/skills/verify-examples/SKILL.md) feature map drives it as `experimental-vue`), except for the devtools, which are React-only. Its shadcn-vue components live in `app/src/components/ui` (`components.json` there; reinstall to bump) and style themselves with the shared `@examples/ui` theme. It isn't deployed.

## Making it real

1. Move `package/` to `packages/vue` as `@raf-query/vue`: give it the published fields the other packages have (`files`, `publishConfig`, `prepack`, `publish:npm`) and the lockstep version.
2. Add it to `.release-it.json`'s publish list, the CI pack-and-import check, the post-release links and npm trusted publishers.
3. Move `sample/` to `www/samples/vue` as `@samples/vue`, and add it to `www/package.json` and knip's `www` ignore list.
4. Move `docs/vue.md` into `www/content/` (its `sample` fences already point at `vue/…`) and list the package in the README, overview, installation page and API reference.
5. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).
