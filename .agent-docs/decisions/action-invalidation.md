# Cache busting after actions is an opt-in feature (human decided)

- `action(write, { invalidates })` wraps a write as a plain async function that can be a React Action. It resolves after the refetches it caused settle, so a transition stays pending until fresh data is on screen.
- `invalidates` takes factories, groups and tag targets, never raw keys. Without it, the `invalidateOnAction()` feature invalidates everything on screen (the default `"active"`), the way routers rerun loaders after an action; `default: "none"` makes it only what an action names.
- Without the feature, actions invalidate nothing.
- Where: `packages/core/src/action.ts`.
