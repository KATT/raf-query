# `Thenable` type (human asked)

- `Thenable<T>` (core, public type) = `Promise<T>` & a `status` union (`pending` / `fulfilled` + `value` / `rejected` + `reason`), the fields React's `use()` reads. The value `useQuery` returns for every handle is one of these at runtime.
- **`useQuery`'s public result is `Thenable<T>`** (human, 2026-10-16; for every handle since [use-query-thenable.md](./use-query-thenable.md)): the tuple's first slot is `Thenable<Data>` (with `{ result: true }` in the PR stacked on #230, `Thenable<Result<Data, ErrorOf>>`; see [typed-errors-stacked.md](./typed-errors-stacked.md)), so apps can read `status` / `value` / `reason` without `use()` — TanStack's non-suspending `data`.
- No `unwrap()` helper (human).
- Apps, examples and docs read with React's `use()` when they want Suspense (human); reading `status` is the non-suspending read, a `switch` on it in the docs' TanStack comparison (`comparison.md`, tested in `use-query.test.tsx`).
- Where: `packages/core/src/thenable.ts`.
