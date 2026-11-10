# A queryFn gets the client making the request (agent)

- `QueryFunctionContext.client` is the `QueryClient` that runs the request, for plain and paged queries (`terminal` in `entry.ts`, `runPages` in `infinite.ts`). Typed as the bare `QueryClient` (any root).
- Why: a server makes one client per request, so the client is the natural key for per-request services (an API client with the request's cookies, an authenticated database reader). Without it, apps smuggled the service through `meta` from a link (`next({ ...op, meta: { ...op.meta, [token]: service } })`), the only channel that reaches paged `queryFn`s.
- Lost: a typed per-client context (`createQueryClient({ context })` threaded through to `queryFn`): more API and generics for what a `WeakMap` keyed by client already does. Revisit if apps want it typed.
- Tests: `packages/core/src/client.test.ts` ("the client making a request"). Docs: `query-functions.md#the-query-function-context`, sample `query-functions.ts#client`.
