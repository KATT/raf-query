# Option-bag generics are unresolved (human asked)

Human: "i don't like how we have so many generics with many positional arguments, i prefer option bags", except where the API mimics Effect.

- Public types stay positional: `QueryOptions<TKey, TQueryFnData, TFail, TData, TTypes>` and `InfiniteData<TPage, TParam>` (`packages/core/src/options.ts`, `infinite/infinite.ts`).
- The shape is an open question. See [open-questions.md](../open-questions.md).
