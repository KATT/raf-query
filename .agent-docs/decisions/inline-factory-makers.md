# Inline generic factory makers infer (agent)

- `QueryFactory`'s input is a bivariant method parameter typed `unknown`, not `(input: never)`. With `(input: never)`, the verbs' `TFactory extends QueryFactory` is the contextual type for an inline `makeFactory(x)` call, so TypeScript infers the maker's own type parameters against it and `never` wins as a contravariant candidate: the input becomes `never` (TS2345), and callers have to return `NoInfer<…>` from their makers.
- `swr` / `revalidate` with `{ pages }` is a second overload, `(factory, input, options: LoadEntryOptions)`, and `LoadEntryOptions` isn't generic. Any later parameter whose type depends on `TFactory` (such as a `LoadOptions<TFactory>` through `IsPaged`) makes an inline maker call fall back to the constraint, even under `NoInfer`. The paged constraint keeps `pages` a type error for plain factories. Found by dogfooding isbabyoutyet's `convexPaginatedQuery`.
- Lost: `input: any` (works, but the repo bans explicit `any`), and documenting `NoInfer` for every maker.
- Tests: `packages/core/src/types.test.ts` ("inline factory makers"), covering `swr`, `revalidate`, `prefetch`, `waterfallHandle` and `invalidateOne`.
