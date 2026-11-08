# `waterfallHandle`'s remix form takes an updater (human)

- `waterfallHandle(factory, input)` builds a handle. `waterfallHandle(factory, handle, (input) => nextInput)` derives one from another handle (usually a loader's): the updater gets the handle's current input and returns the new one, so render-time state merges into it: `waterfallHandle(searchQuery, props.search, (input) => ({ ...input, q }))`.
- While the new input's key hashes the same as the handle's, it returns the original handle object. `useQuery` depends on handle identity, and a loader's handle isn't a waterfall handle, so reading it neither refetches nor warns.
- A plain value as the third argument is a type error (one way to write it; the updater sees the input's type).
- Lost: `waterfallHandle(factory, handle, input)`, which needed the full input spelled out at the call.
- Files: `packages/core/src/load.ts`; tests in `load.test.ts` ("keeps the handle while the updated input maps to the same query"), `types.test-d.ts` ("waterfall types"), `packages/react/src/use-query.test.tsx` ("keeps a loaded handle while waterfallHandle's updater returns the same input"); docs in `www/content/url-state-and-pagination.md#input-typed-before-the-url`, `handles.md`, `api-reference.md`.
