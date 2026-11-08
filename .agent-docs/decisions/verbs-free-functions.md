# Cache verbs are free functions (agent)

- Reads and writes outside a loader are functions that take the client first: `getData`, `setData`, `isFetching`, and `invalidate`, `reset` and `remove` in `One` / `Many` / `All` forms.
- Why: an app bundles only the verbs it imports, and each verb's types follow the client it's given (`ClientFor<F>` rejects a factory made for another client).
- Invalidation marks matching entries stale with a stamp ordered by the client's sequence number. Entries on screen refetch at once; the rest refetch when next read.
- Where: `packages/core/src/verbs.ts`.
