# Typed errors: follow-ups before they settle (human)

- Typed errors and `@raf-query/boundary` left #230 to keep it reviewable and came back in #235. What they are and why: [typed-errors.md](./typed-errors.md).
- Follow-ups the human asked for:
  - Errors declared once, then used by every query that can fail with them: `failure("PostNotFound")<{ slug }>()`.
  - `QueryBoundary errors={[q1, q2]}`: handlers typed from every listed query's errors, matched by tag, with no filter on which query's entry failed.
  - Its `retry` refetches every failed query whose error has a handled tag.
  - Maybe a `createErrorBoundary`, like raf-effect-atom's ([error boundaries](https://raf-effect-atom.katt.dev/docs/error-boundaries)).
- Where: `packages/core/src/fail.ts`, the fail handling in `entry.ts`, `infinite/infinite.ts`, `hydration/hydration.ts` and `links/retry/retry.ts`, `packages/react/src/use-query.ts`, `packages/boundary/`, and the "Expected errors" section of `www/content/query-functions.md`.
