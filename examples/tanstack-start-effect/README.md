# raf-query on TanStack Start with Effect

[![Open in CodeSandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/tanstack-start-effect?file=/apps/tanstack-start-effect/src/routes/issues.index.tsx)

Live at [tanstack-start-effect.raf-query.katt.dev](https://tanstack-start-effect.raf-query.katt.dev).

A small issue tracker built with [raf-query](https://github.com/KATT/raf-query#readme), written with [Effect](https://effect.website) end to end: the API is an Effect RPC group, the `queryFn`s return Effects (typed errors and services), form actions are `Effect.fn`s, and the router's search params are Effect Schemas. Loaders use the same Promise `prefetch` as the non-Effect apps; `queryClient.runPromise` runs the actions. [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) is the same app written with Promises.

| Screen / action                                         | Shows                                                                                                                                  | Files                                                                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Issue list: status filter and sort in the URL           | `validateSearch` with an Effect Schema → Promise `prefetch`, infinite scroll, `whilePending` dimming                                   | `src/routes/issues.index.tsx`, `src/components/issue-list.tsx`                                                                     |
| Issue detail                                            | `prefetch`, so the route opens at once onto skeletons; reading the `Result` turns `IssueNotFound` into the router's not-found page     | `src/routes/issues.$issueId.tsx`, `src/start.ts`                                                                                   |
| Comments                                                | Paged query with infinite scroll, streamed `prefetch`                                                                                  | `src/components/comments.tsx`                                                                                                      |
| Assignee card                                           | `useQuery` returns `Result<User, …>` (client `throwOnError` defaults false with a `layer`); `Result.match` for `IssueNotFound` / retry | `src/queries.ts`, `src/components/user.tsx`                                                                                        |
| Inline-edit title and body; change status from the list | Actions as `Effect.fn`s run with `queryClient.runPromise`, typed `EmptyTitle` / `EmptyBody` caught into the inline message             | `src/components/edit-title.tsx`, `src/components/edit-body.tsx`, `src/components/status-select.tsx`, `src/components/comments.tsx` |

The RPC group, its schemas and its typed errors are in `src/rpc.ts`; `src/rpc-handlers.ts` implements them over the fake database, and the server route `src/routes/rpc.ts` serves them. `src/issues.ts` is the `Issues` service, the group's typed client. The query client's `layer` (`src/router.tsx`) provides it, so query factories (`src/queries.ts`) and actions `yield* Issues`. `ErrorOf` / `ServicesOf` on a factory name the query's error and service types. Failures keep their type across SSR: the router integration sends them with `keepErrors`, and `src/start.ts` registers a serialization adapter for `IssueNotFound`. During SSR the client calls the handlers in process; in the browser it posts to `/rpc` (see `#rpc-transport` in `package.json`). The data comes from an in-memory fake database that waits the latency picked in the top bar (or `DB_LATENCY_MS`, default 400) ± 50% per call and resets when the server restarts.

The top bar's settings live in cookies, so the server renders with them too, and **Reset** clears them. **Prefetch links** sets the router's `defaultPreload` (`src/settings.ts`) and starts **off** (`false`): on intent, in the viewport, on render, or off. **Latency** travels with each RPC in the `x-db-latency` header: the `Issues` layer reads the cookie (the request's during SSR, the document's in the browser), and the handlers pass it to the database call.

## Run it

From the root of this repo:

```shell
pnpm install
pnpm dev:effect
```

Then open <http://localhost:3005>.
