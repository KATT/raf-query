# A queryFn gets the client making the request, and its plugins' context (agent)

- `QueryFunctionContext.client` is the `QueryClient` that runs the request, for plain and paged queries (`terminal` in `entry.ts`, `runPages` in `infinite.ts`). It's typed with the root of the factory's builder: the app's client for a builder bound to its client factory, the bare `QueryClient` for one bound to nothing (`bindQueryOptions()`).
- Why: a server makes one client per request, so the client is the natural owner of per-request services (an API client with the request's cookies, an authenticated database reader).
- Those services are typed: a plugin that declares a `context` gives its fields to every `queryFn` of the client (`plugin<Api>({ context: { api } })`, then `queryFn: ({ api, signal }) => …`), for the client or per request from the plugin's link ([parts-options-context.md](./parts-options-context.md), [link-context.md](./link-context.md)).
- Lost: a `WeakMap` keyed by `context.client` as the documented way to reach a per-request service (untyped, and a lookup that can miss).
- Tests: `packages/core/src/client.test.ts` ("the client making a request", "a client's plugins"). Docs: `query-functions.md#the-query-function-context`, sample `query-functions.context.ts#context`.
