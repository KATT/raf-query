# Inline generic factory makers infer (agent)

- `QueryFactory`'s input is a bivariant method parameter typed `unknown`, not `(input: never)`. The verbs' `TFactory extends QueryFactory` is the contextual type for an inline `makeFactory(x)` call, so TypeScript inferred the maker's own type parameters against it, and `never` won as a contravariant candidate. The input then became `never` (TS2345). Callers had to return `NoInfer<…>` from their makers.
- Not fixed: the `ensure` / `fetch` form with `{ pages }`. Any later parameter that reaches `ReturnType<TFactory>` (as `LoadOptions` does through `IsPaged`) makes the inline call fall back to the constraint. Overloads, `NoInfer` and a direct function-type `LoadOptions` all failed. Docs say to bind the factory or pass type arguments.
- Lost: `input: any` (works, but the repo bans explicit `any`), and documenting `NoInfer` for every maker.
- Tests: `packages/react/src/types.test.ts` ("infer generic factory makers passed inline").
