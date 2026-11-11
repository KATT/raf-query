# A queryFn gets the client making the request, and its parts' context (agent)

- `QueryFunctionContext.client` is the `QueryClient` that runs the request, for plain and paged queries (`terminal` in `entry.ts`, `runPages` in `infinite.ts`). In a factory of a bound builder it's typed with the builder's root; in an unbound one it's the bare `QueryClient`.
- Why: a server makes one client per request, so the client is the natural owner of per-request services (an API client with the request's cookies, an authenticated database reader).
- Those services are typed: a part that declares a `context` gives its fields to every `queryFn` of the client (`part<Api>({ context: { api } })`, then `queryFn: ({ api, signal }) => …`), and `client.context` holds them ([parts-options-context.md](./parts-options-context.md)).
- Lost: a `WeakMap` keyed by `context.client` as the documented way to reach a per-request service (untyped, and a lookup that can miss).
- Tests: `packages/core/src/client.test.ts` ("the client making a request", "a client's parts"). Docs: `query-functions.md#the-query-function-context`, sample `query-functions.context.ts#context`.
