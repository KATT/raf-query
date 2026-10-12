# Casts in the type-erased cache (agent)

- `.oxlintrc.json` turns off `anti-slop/no-unknown-parameters`, `no-unknown-returns`, `no-unsafe-dictionary-type` for `packages/*/src/**`: the cache is type-erased on purpose and factory generics restore types at the public boundary. Each remaining cast has a `SAFETY:` comment and an oxlint disable. Where a value must be widened before the cast, use the package's `unsafeCast<T>(value: unknown)` (`cast.ts`, not exported): `anti-slop/no-widen-then-assert` bans the inline `const x: unknown = …; x as T` form.
