# Test cleanup with `using` (human decided)

- Tests undo what they set up with `using`, not `onTestFinished` (lint: `no-restricted-imports` from `vitest` and `@effect/vitest`) or lifecycle hooks (`vitest/no-hooks`). A helper that sets something up returns a `Disposable` that undoes it, such as `using _timers = fakeTimers()`. Vitest spies are already disposable: `using errors = vi.spyOn(console, "error")`.
- Unused bindings take a `_` prefix (`no-unused-vars` ignores `^_`).
- The packages' `lib` includes `ESNext.Disposable` for the tests' types. Library code targets ES2024, so it doesn't use `using`, `Symbol.dispose` or `DisposableStack` (lint: `workspace/no-explicit-resource-management` in `packages/*/src` and `.experimental/*/package/src`, off for tests and `test-utils.ts`).
