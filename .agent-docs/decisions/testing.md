# Tests (agent)

- React tests: render, rerender and click inside **async** `act` (`await act(async () => …)`); a sync `act` never resumes a suspended tree after its promise resolves. Responding to a fake request needs a macrotask wait inside the act. Effect tests that fork a stream before a cache write need `Effect.forkChild(x, { startImmediately: true })`.
- Behavior tests of the Promise API (`client`, `hydration`, `infinite`, `types`) live in `packages/react` with `QueryClient`; core's tests drive `QueryCache` with `it.effect`.
