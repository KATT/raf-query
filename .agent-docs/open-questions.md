# Open questions

None of these is decided.

- **The default preset of plugins (A / B / C).** The docs teach `recommended()`. A bare `createQueryClient()` includes none of those behaviors ([decisions/links-features-meta.md](./decisions/links-features-meta.md)).
- **Adopting the tRPC pull-request template repo-wide.** This repo's template is its own ([decisions/pr-template-links.md](./decisions/pr-template-links.md)).
- **Whether to merge [#231](https://github.com/KATT/raf-query/pull/231).** The sync's place and its gaps are in [decisions/tanstack-query-sync.md](./decisions/tanstack-query-sync.md).
- **Options-bag generics.** Proposal: [`options-bag-generics.md`](/cursor/stores/bc-c801f3ec-7a8e-47a5-ae6b-41a569130d08/docs/options-bag-generics.md). Public types stay positional ([decisions/option-bag-types.md](./decisions/option-bag-types.md)).
- **Streamed hydration for React Router.** Its server render fetches queries that start during render, and the browser fetches them again. An inline `<script>` per settled query during SSR would hand them over, as TanStack Start's stream does ([decisions/server-renders-start-no-requests.md](./decisions/server-renders-start-no-requests.md)).
