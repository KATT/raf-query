# Structural sharing (agent)

- **Structural sharing** (`structural-sharing/structural-sharing.ts`, a port of TanStack's `replaceEqualDeep`) runs in `write` (`entry.ts`), so fetch results, `setData` and hydration all share. Equal data keeps the old promise too, so readers see no change. Option is `structuralSharing: boolean` only; TanStack's function form isn't needed yet.
- `replaceEqualDeep` reads only an object's own keys (`Object.keys`, `Object.hasOwn`, `Object.fromEntries`). A JSON `"__proto__"` key stays data and does not set the prototype. Test: `packages/core/src/structural-sharing/structural-sharing.test.ts` ("keeps a `__proto__` key as data").
