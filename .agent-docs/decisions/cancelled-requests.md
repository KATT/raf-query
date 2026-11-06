# Cancelled requests reject with an AbortError (human asked)

- Human: "CancelledError could use a default AbortError". When an entry is removed or cleared before its request settles, whatever waits on that request (a `load`'s fetch or ensure entries) rejects with `abortError()`, a `new DOMException("The query was cancelled", "AbortError")`, as an aborted `fetch` does. Callers check `error.name === "AbortError"`.
- Lost: matching any `AbortError` by name inside the core. A `queryFn` that throws its own `AbortError` must stay an ordinary failure, or a first load would never settle.
- Where: `packages/core/src/entry.ts` (`abortError`, `remove`).
