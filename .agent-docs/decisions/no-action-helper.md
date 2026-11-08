# No `action()` write helper, for now (human)

- `action()` and the `invalidateOnAction()` feature are removed for now; they may return. Mutations are a plain React action written in the component: `useQueryClient()`, await the write, then await one verb (a [target list](./verb-target-lists.md) for several targets), used with `<form action>`, `useActionState` or `startTransition`. Docs: `www/content/mutations.md`.
- What it was: `action(write, { invalidates?, client? })` returned a plain async function that ran the write, then invalidated `invalidates` on every browser client registered by `invalidateOnAction()` (or only `client`), and resolved when those refetches settled. Defined at module scope and passed straight to `<form action>`. Without `invalidates`, the feature's default `"active"` invalidated everything. `recommended()` included the feature.
- Why it went:
  - Hidden global state: a module-level registry of clients, filled by the feature.
  - A silent no-op on a client without the feature.
  - Defaults that flip: no `invalidates` invalidated everything, no feature invalidated nothing.
  - `invalidates` was fixed up front, so it couldn't depend on the action's arguments or the write's result.
  - The name clashes with React's "action".
- To revive it, start from `packages/core/src/action.ts`, its tests in `features.test.ts` ("actions") and `types.test-d.ts`, and the docs in `www/content/mutations.md` at commit `f198347035`. Address the problems above first.
