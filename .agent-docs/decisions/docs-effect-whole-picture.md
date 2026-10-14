# Effect docs show the whole app, React included (human asked)

- Human: the Effect pages should show actual React usage and the whole picture, not Effect fragments.
- `effect.md` opens with "The whole picture": one issue tracker on TanStack Start, file by file: tagged errors and the `IssueApi` service, query factories, the `QueryClient` with its `layer`, the typed router context, a loader run with `queryClient.runPromise`, components reading with `useQuery` + `use()`, and an `Effect.fn` form action with `useActionState`. `effect-services.md` and `effect-errors.md` reuse that app and end each topic in a component.
- The app lives in `www/content/_effect.ts` for the blocks' hidden setup; `effect.md` shows the same code, so keep them in step.
- Twoslash compiles with TypeScript 6 (TS 7 has no JS API). There, `Context.Service` classes compare structurally loose (`const b: IssueApi = analytics` passes), so a "missing service" type error can't be shown with `// @errors`; TS 7, which the repo uses, rejects it. The docs state that rule in prose instead.
