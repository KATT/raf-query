# Effect example follows Effect's own idioms (human asked, agent reviewed)

- Human: "see if we align with how to use effect effectively" against `.repos/effect` (`LLMS.md`, `ai-docs/src`).
- Reusable Effect functions are `Effect.fn("name")`, with combinators as extra arguments, never `.pipe` on the result (`LLMS.md`). Loaders, actions and RPC handlers all follow this; handler spans are named `IssueRpcs.<Procedure>`.
- Failing: `return yield* new IssueNotFound(...)` inside the generator, as in `ai-docs/src/51_http-server/fixtures/server/Users.ts`. No `flatMap(x ? succeed : fail)` ternaries.
- `Service.use(f)` for a single call (queryFns, one call in an action), as in `ai-docs/src/04_integration/10_managed-runtime.ts`. `const s = yield* Service` when the generator uses it more than once (the issue loader's `cache`).
- A step shared by several Effects is an Effect value, not a copy: `invalidateIssues` in `src/queries.ts`.
- `retry` is a shared `Schedule` (`retryUnlessNotFound`): `Schedule.exponential` + `Schedule.while` on `step.input`, which is what core builds from a predicate anyway. A named predicate would need an `unknown` parameter, which `anti-slop/no-unknown-parameters` rejects, and `RetryPolicy` isn't exported from `@raf-query/react`.
