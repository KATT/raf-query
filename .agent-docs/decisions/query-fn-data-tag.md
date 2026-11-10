# setData's data comes from a phantom property, not select's parameter (agent)

- `QueryOptions` carries `[queryFnDataTag]?: TQueryFnData` next to `[dataTag]?: TData`. `QueryFnDataOf<F>` (`options.ts`) reads it, and `setData` / `getData` type their data with it (`WritableData` in `verbs.ts`).
- Why: `setData` read the data type by inferring `select`'s parameter (`ReturnType<F> extends { select?: (data: infer T) => unknown }`). A parameter typed that way stops TypeScript inferring a factory that a generic maker builds inline (`setData(client, queryFor(ref), input, data)`): the factory falls back to its constraint and the data param becomes `never` or the constraint's. Hoisting the factory into a `const` worked, and the same in TypeScript 5.9 and 7. Inferring from a covariant property doesn't trip it, which is why `DataOf` (through `dataTag`) always worked. Integrations with one maker per backend function (`queryFor(api.messages.list)`) hit it.
- Lost: dropping `setData`'s overloads for one signature (not the cause; the overloads stay).
- Tests: `packages/core/src/types.test-d.ts` ("infer a factory a generic maker builds inline").
