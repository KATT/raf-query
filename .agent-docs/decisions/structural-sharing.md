# Structural sharing (agent)

- **Structural sharing** (`share.ts`, a port of TanStack's `replaceEqualDeep`) runs in `write` (`entry.ts`), so fetch results, `setData` and hydration all share. Equal data keeps the old promise too, so readers see no change. Option is `structuralSharing: boolean` only; TanStack's function form isn't needed yet.
