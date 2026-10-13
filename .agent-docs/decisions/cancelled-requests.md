# Cancelled requests reject with an AbortError (human asked)

- Human: "CancelledError could use a default AbortError". `qc.fetch` / `qc.ensure` reject with `new DOMException("The query was cancelled", "AbortError")` when the entry is removed or cleared before the request settles, as an aborted `fetch` does. Promise callers check `error.name === "AbortError"`.
- The Effect API keeps `Query.CancelledError` (a `Data.TaggedError`), so `catchTag("CancelledError")` works. Cancellation is its own `Outcome` kind (`outcome.ts`): `unwrap` throws the `AbortError`, and `/effect`'s `awaitOutcome` fails with `CancelledError`.
- Lost: one error class for both APIs. Matching any `AbortError` by name inside the engine was rejected: a `queryFn` that throws its own `AbortError` must stay an ordinary failure, or a first load would never settle.
