# Types take a bag, not a list of type arguments (human asked; details agent)

Human: "i don't like how we have so many generics with many positional arguments, i prefer option bags", except where we mimic Effect.

- **Option and data types take one bag** of named members (`data`, `error`, `key`), each optional one defaulting, so a user writes `QueryOptions<{ data: Post }>` and a factory hovers that way.
- **Kept positional**: the `queryOptions` / `infiniteQueryOptions` function type parameters. TypeScript can't infer a bag's members from an argument, and they exist only for inference.
- Not built yet. `QueryOptions<TKey, TQueryFnData, TFail, TData, TTypes>` and `InfiniteData<TPage, TParam>` are positional (`packages/core/src/options.ts`, `infinite.ts`).
