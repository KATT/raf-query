# Handles in TanStack Router route context (agent)

- Handles go in `beforeLoad` context and loader data as they are. At runtime they always cross: the router dehydrates each match's `__beforeLoadContext` (`b`) with seroval, and a handle is a plain `{ queryKey, input }` (plus `defined: true`). Only the types block it: with Start's `ssr: true` registered, `beforeLoad`'s result goes through `ValidateSerializable`, which rejects the handle's `queryKey: ReadonlyArray<unknown>` and inputs typed `unknown`.
- Fix: `tanstack-router-shared.ts` augments `SerializableExtensions` with `rafQueryHandle: QueryHandle` (which `DefinedQueryHandle` extends), so the check stops at the handle. It's in the shared module so both the server and browser builds' types carry it.
- Lost: retyping `QueryKey` as a JSON type (breaks inputs typed as interfaces, and every factory).
- No test pins it yet.
