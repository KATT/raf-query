# Typed errors and @raf-query/boundary ship in a PR stacked on #230 (human)

- Typed errors (`fail()`, `Fail`, `QueryFailure`, `isFail`, `isQueryFailure`, `failOf`, `Result`, `ErrorOf`, `useQuery`'s `{ result: true }`) and the `@raf-query/boundary` package (`QueryBoundary`) leave #230 in one commit, to keep #230 reviewable. A PR stacked on #230 brings them back by reverting that commit, then builds on them. What they are and why: [typed-errors.md](./typed-errors.md).
- In #230 a request either returns data or throws. Thrown errors reject the read and the `load`, and a pending entry's server error crosses hydration as a `RedactedError`. `retry()` skips thrown `Response`s and aborted requests.
- Follow-ups for the stacked PR:
  - Errors declared once, then used by every query that can fail with them: `failure("IssueNotFound")<{ id }>()`.
  - `QueryBoundary errors={[q1, q2]}`: handlers typed from every listed query's errors, matched by tag, with no filter on which query's entry failed.
  - Its `retry` refetches every failed query whose error has a handled tag.
  - Maybe a `createErrorBoundary`, like raf-effect-atom's ([error boundaries](https://raf-effect-atom.katt.dev/docs/error-boundaries)).
- Where (in the stacked PR): `packages/core/src/fail.ts`, the fail handling in `entry.ts`, `infinite/infinite.ts`, `hydration/hydration.ts` and `links/retry/retry.ts`, `packages/react/src/use-query.ts`, `packages/boundary/`, and the "Expected errors" section of `www/content/query-functions.md`.
