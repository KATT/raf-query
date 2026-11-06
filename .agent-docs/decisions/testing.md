# Tests (agent)

- React tests: render, rerender and click inside **async** `act` (`await act(async () => …)`); a sync `act` (RTL's bare `render`) never resumes a suspended tree after its promise resolves, boundary or not. It's React's, not raf-query's: the retry sits on the sync act's dropped queue as `fakeActCallbackNode`, and later pings reuse that node instead of scheduling (`react-dom-client.development.js`, `ensureRootIsScheduled`). `renderWith` and the fake backend's `respondAll` in `packages/react/src/test-utils.tsx` wrap their work in it; documented in `www/content/testing.md`. Responding to a fake request needs a macrotask wait (`flush`) inside the act.
- Don't unit test the docs site's presentation (human): the build catches broken samples and markdown.
- Behavior tests of the kernel (`entry`, `load`, `verbs`, `hydration`, `infinite`, `links`, `features`) live in `packages/core`. Type tests are `packages/core/src/types.test.ts`.
