# `Thenable` type (human asked)

- `Thenable<T>` (core, public type) = `Promise<T>` & a `status` union (`pending` / `fulfilled` + `value` / `rejected` + `reason`), the fields React's `use()` reads. The value `useQuery` returns for a plain handle is one of these at runtime.
- **`useQuery`'s public result is `Thenable<T>`** for a plain handle (human, 2026-10-16): the tuple's first slot is `Thenable<Data>` (or `Thenable<Result<Data, ErrorOf>>`), so apps can read `status` / `value` / `reason` without `use()` — TanStack's non-suspending `data`.
- No `unwrap()` helper (human).
- Apps, examples and docs read with React's `use()` when they want Suspense (human); reading `status` is the non-suspending read.
- Where: `packages/core/src/thenable.ts`.
