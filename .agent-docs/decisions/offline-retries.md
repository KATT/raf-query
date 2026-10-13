# Retries pause while offline (agent)

- **Retries pause while offline** (`platform.ts` `whenOnline`, used by `attempt` in `entry.ts`): after the delay, a browser retry waits for the `Platform`'s `"online"` event if it reports offline; `whenOnline(platform, signal)` resolves on `"online"` or when the request's signal aborts, removing the listener either way. Scoped to retries only: no TanStack `networkMode`, no `fetchStatus: "paused"`, and the first attempt isn't held back. No opt-out option yet.
