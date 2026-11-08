# Retries pause while offline (agent)

- **Retries pause while offline** (`whenOnline` in the `retry()` link, `links/retry/retry.ts`): after the delay, a browser retry waits for the window's `"online"` event if `navigator.onLine` is `false`; the listener is tied to the request's `signal`, so aborting the request removes it. Scoped to retries only: no TanStack `networkMode`, no `fetchStatus: "paused"`, and the first attempt isn't held back. No opt-out option yet.
