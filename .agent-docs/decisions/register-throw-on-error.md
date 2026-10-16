# The client's throwOnError default is declared on Register (agent)

- Apps declare `throwOnError: true | false` on `Register`. `ThrowsOnError` uses it for reads that omit the flag. With nothing declared, an omitted flag stays `false` (`Result`, the default with a `layer`).
- Once declared, `QueryClientConfig` requires that same `throwOnError` (`QueryClientArgs` makes the config itself required), and so does `QueryProvider`'s `config`. The runtime default depends on `layer`, which types can't follow, so the client has to state the flag for the types to be right.
- Why: a layered app that throws had to pass `throwOnError: true` on every read (KATTCORP/isbabyoutyet had 34 of them), because a flag set only on the client left the types saying `Result`.
- Lost: a generic `QueryClient<TServices, TThrow>`, because `useQuery` gets its client from context, which has no type. Also lost: an optional `throwOnError?: true` on the config, which allows omitting it, and then a client with a `layer` would not throw.
- Type tests need a program of their own per declaration: `packages/react/type-tests/throw-on-error-{true,false}`, each with a `tsconfig.json` that the package's `typecheck` runs. Vitest runs them too, where `expectTypeOf` is a no-op.
- Lives in `packages/core/src/options.ts` (`RegisteredThrowOnError`), `controls.ts` (`ThrowsOnError`), `client.ts` (`QueryClientConfig`, `QueryClientArgs`), `packages/react/src/query-provider/query-provider.tsx`, `www/content/effect-errors.md#declare-the-clients-default`.
