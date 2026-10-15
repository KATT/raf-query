# Opt-in `brand` keeps same-signature factories apart (human asked; shape agent)

- Human: "Couldn't every queryOption() call just add a unique symbol?" It can't do it alone: `unique symbol` types exist only on `const` declarations (TS1335 elsewhere), and a symbol made inside `queryOptions` is one type for every call. So the app declares the symbol (`const post = Symbol("post")`) and passes it as `brand`.
- **`brand` is always in the returned bag**, `undefined` without one. TypeScript compares two `QueryOptions<…>` by their bags (measured variance), and a bag without `brand` accepts any brand, so leaving it out at the default let an unbranded factory take branded handles, and (handles compare both ways) the reverse. A bag written without `brand` (`QueryOptions<{ data: Post }>`) means any brand (`BrandIn`).
- `brand` is a real option value that only types read: options never leave the process (dehydration sends keys, data and `meta`), so a `Symbol` is safe there.
- Gaps, accepted: opt-in (unbranded same-signature factories still mix with each other), one symbol declaration per factory, and annotated return types without `brand` widen it.
- Lost: a runtime check in `useQuery` (human: "I don't like the idea of runtime checks"); see the key-type alternative in PR #167.
- Code: `packages/core/src/options.ts` (`BrandField`, `BrandIn`); tests: `packages/react/src/types.test.ts` ("keep handles of branded factories with the same signature apart"). Docs: `www/content/query-factories.md#branded-factories`.
