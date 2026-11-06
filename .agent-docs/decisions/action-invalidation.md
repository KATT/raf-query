# Cache busting after actions is an opt-in feature (human decided)

- `action(write, { invalidates })` wraps a write as a plain async function that can be a React Action. It resolves after the refetches it caused settle, so a transition stays pending until fresh data is on screen.
- `invalidates` takes factories, groups and tag targets, never raw keys. Without it, the `invalidateOnAction()` feature invalidates everything on screen (the default `"active"`), the way routers rerun loaders after an action; `default: "none"` makes it only what an action names.
- Without the feature, actions invalidate nothing.
- **`client` binds an action to one client** (human picked, 2026-11-06), for pages that mount several (micro-frontends). Only that client's `invalidateOnAction()` reacts; without `client`, every mounted browser client does. `ActionOptions<TTypes>` takes its root from `client`, so `invalidates` targets go through the verbs' `TargetFor` and a `where` is checked against that root's `meta`; factories and groups aren't root-checked, since one from another root matches nothing on the client. Tests: `features.test.ts` ("reaches only its client when bound to one"), `types.test.ts` ("check a bound action's targets").
- Only browser clients register. An action is a plain function with no client at call time, so it reaches every mounted browser client; a server client belongs to one request, and registering it would let one request's action invalidate another's cache. Test: `packages/core/src/features.test.ts` ("never reaches server clients").
- Where: `packages/core/src/action.ts`.
