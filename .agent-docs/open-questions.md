# Open questions

None of these is decided.

- **Where `meta` flows (V1 / V2 / V3).** V1: groups and tags live in core. V2: core carries `meta`, typed by a global `Register`. V3: links and features declare the `meta` they read, and factories opt in with `def`. What the code does today is in [decisions/keys-groups-tags.md](./decisions/keys-groups-tags.md) and [decisions/links-features-meta.md](./decisions/links-features-meta.md).
- **The default feature preset (A / B / C).** The docs teach `recommended()`. A bare `createQueryClient()` includes none of those behaviors ([decisions/links-features-meta.md](./decisions/links-features-meta.md)).
- **Adopting the tRPC pull-request template repo-wide.** This repo's template is its own ([decisions/pr-template-links.md](./decisions/pr-template-links.md)).
- **Whether to merge [#231](https://github.com/KATT/raf-query/pull/231) into [#230](https://github.com/KATT/raf-query/pull/230).** The sync's place and its gaps are in [decisions/tanstack-query-sync.md](./decisions/tanstack-query-sync.md).
- **Whether to rename the second tuple element from `postState` to `controls`.** The types are already `QueryControls` and `InfiniteQueryControls`. Docs, samples, examples and tests name the slot `xState` ([decisions/use-query-thenable.md](./decisions/use-query-thenable.md)).
- **Options-bag generics.** Proposal: [`options-bag-generics.md`](/cursor/stores/bc-c801f3ec-7a8e-47a5-ae6b-41a569130d08/docs/options-bag-generics.md). Public types stay positional ([decisions/option-bag-types.md](./decisions/option-bag-types.md)).
