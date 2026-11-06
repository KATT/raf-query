# Cache busting after actions is an opt-in feature (human decided)

- `action(write, { invalidates })` wraps a write as a plain async function that can be a React Action. It resolves after the refetches it caused settle, so a transition stays pending until fresh data is on screen.
- `invalidates` takes factories, groups and tag targets, never raw keys. Without it, the `invalidateOnAction()` feature invalidates everything on screen (the default `"active"`), the way routers rerun loaders after an action; `default: "none"` makes it only what an action names.
- Without the feature, actions invalidate nothing.
- Only browser clients register. An action is a plain function with no client at call time, so it reaches every mounted browser client; a server client belongs to one request, and registering it would let one request's action invalidate another's cache. Test: `packages/core/src/features.test.ts` ("never reaches server clients").
- Where: `packages/core/src/action.ts`.
