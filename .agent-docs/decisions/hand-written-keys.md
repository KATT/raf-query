# Hand-written keys are allowed; `group` is on the main entry (human decided)

- `queryOptions` and `infiniteQueryOptions` take any plain array as `queryKey` (`QueryKey`, `ReadonlyArray<unknown>`), `const`-inferred so a handle's `queryKey` is the literal tuple. Groups stay the recommended way to build keys, because one group invalidates many queries; a group matches a hand-written key that starts with its path.
- `group` is exported from `@raf-query/core` and `@raf-query/react`. The `/groups` subpaths hold only the opt-in tag pieces: `tag`, `Tag`, `groups()`, `TagsMeta`. `group` tree-shakes away when an app doesn't call it (checked with a hand-written-key copy of the bundle-size base fixture: no `group` code in it).
- The type-only `GroupKey` brand (and `KeyTuple`, which stripped it for handles) is gone: nothing read its `path`, and its only effect was rejecting hand-written keys.
- Cost: the development check that a subgroup and a query don't share a name only sees keys `group()` builds, not hand-written ones.
- Unchanged: verbs and `action({ invalidates })` take factories, groups and targets, never raw keys.
- Where: `packages/core/src/keys.ts`, `options.ts`, `groups.ts`; tests in `types.test-d.ts` ("keys") and `verbs.test.ts` ("matches a hand-written key…"); docs in `www/content/query-keys.md#hand-written-keys`.
