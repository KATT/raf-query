# A link can give or change the `queryFn` context per request (human asked, 2026-11-11)

- The gap: a plugin's `context` was one object per client, so a link could not hand the `queryFn` a value that belongs to one request (a refreshed token, a trace id), which is the main thing a tRPC link does with `op.context`. Human: "Fix that gap."
- `Operation.context` is what the `queryFn` gets beside `client`, `queryKey` and `signal`. It starts as the plugins' client context, and a link passes `next` an operation with another `context` to change it for that request. The links after it see the change.
- A plugin that declares a `context` gives it one of two ways, and `plugin()`'s overloads check which:
  - for the client: `plugin<Api>({ context: { api } })`, as before. Its link may still replace fields per request.
  - per request: no `context`, and a `link` whose `next` only takes an operation that has the declared fields, so a link that forgets to add them doesn't compile.
- A link can only set the context its own plugin declares: `next` takes `Operation<TDecl>`, so an undeclared field is an excess property.
- A paged query's pages are one operation, so they share its context.
- Lost: `client.context` as a public, typed property. A context a link gives per request is not on the client, so the type would promise fields that are not there. The client's own context is internal (`client["~context"]`).
- Lost: one union type for `plugin()`'s argument. TypeScript did not pick the union's member when the `context` value held a function, and left the link's parameters untyped, so `plugin()` has one overload per way.
- Where: `packages/core/src/client.ts` (`Operation`, `plugin`), `entry.ts` and `infinite/infinite.ts` (the `queryFn` context). Tests: `packages/core/src/client.test.ts` ("a client's plugins"), `types.test-d.ts` ("need a plugin's context where it declares one"). Docs: `plugins.md#context-per-request`.
- (agent, after an independent review) The kernel puts the context a link passes on over the context the link got (`passedOn` in `entry.ts`), so `next({ ...op, context: { token } })` adds `token` and keeps what the other plugins gave. Without the merge that call compiled and dropped their context.
