# No `queryClient.waitFor` (human decided)

- Asked for while migrating KATTCORP/isbabyoutyet: its auth flow (`waitForMe`) waits for `profile.get` to reflect a sign-in or sign-out by combining the cache's internal reads and subscriptions, `prefetch` and an `AbortSignal`. The proposal was `queryClient.waitFor(factory, input, predicate, { signal })`: start the query, resolve with the first data the predicate matches (#216).
- Rejected: a predicate-wait on the cache serves one flow, and the app reads the cache's internals instead of using the query. Apps wait with the verbs they already have: `invalidateOne` then `load` with a `revalidate` (or `swr`) and check the data it returns, and for a change that arrives later (a live subscription) read the query through a subscription or poll it with a `revalidate`, in the app.
- Don't add it for a single caller. Reconsider only if several apps hand-roll the same wait and the verbs above can't express it.
