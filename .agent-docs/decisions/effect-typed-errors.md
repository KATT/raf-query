# Typed errors throw by default, no error wrapper (human asked, agent designed)

- Human: the Effect docs should show how errors are inferred; maybe an option to throw if you don't want to handle errors, and look at how other Effect libraries (voidhashcom/effect-query) do it.
- **Inferred, then caught with Effect**: an Effect `queryFn`'s error type is the query's (`ErrorOf<TFactory>`), and every cache verb fails with it. Apps narrow with `Effect.catchTag(s)`, in the `queryFn` (removes the tag from the query's type) or in the loader / action run by `queryClient.runPromise`.
- **Throwing is already the default**, so there is no option for it: an uncaught failure rejects the Promise verbs with the failure itself, `use()` throws it to the error boundary, and loaders reject into `errorComponent`. Same model as a rejected promise.
- **No effect-query-style wrapper** (`EffectQueryFailure | EffectQueryDefect` with `error.match({ … })`): `state.error` is `Cause.squash`ed (a failure or a defect), errors from a server render arrive as `RedactedError` (unless `keepErrors`), and class instances don't survive serialization, so a typed `match` on the React side would lie. It would also change what Promise users' errors are. React-side errors stay `unknown`; narrow with `Schema.is`.
- Lost: a typed `controls.error` / error-boundary error (can't be sound across SSR and shared defaults); a `throwOnError: false` option (the throw is how Suspense readers learn of failures).
- Lives in `www/content/effect-errors.md`.
