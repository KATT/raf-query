# Reading a thenable's `status` sees its in-place settle (human)

- A first load settles the entry's pending thenable in place (`write` / `failWith` in `entry.ts` resolve `pendingThenable`), so `use()` resumes on the promise it suspended on. The promise's identity doesn't change, so a reader that only watched the promise would never hear about it: a component that only read `status` would stay on its pending UI.
- Human: "the tracker should track if props of the thenable are read". `useQuery` subscribes to the entry's whole state with `useSyncExternalStore`, so every settle re-renders its readers, and a component reading `status` sees it change.
- Lost: per-property tracking. Readers that only `use()` the thenable re-render on a settle too.
- No test pins a `status`-only reader yet.
- Where: `packages/core/src/entry.ts`, `packages/react/src/use-query.ts`.
