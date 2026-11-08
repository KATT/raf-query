# Important defaults leads with "reads never refetch stale data" (human)

- The first item of `www/content/important-defaults.md`: reading a query (`useQuery`) never refetches stale data when a component mounts, because loaders decide freshness. Stale data refreshes when the next loader starts it, on invalidation, on focus and reconnect, and through polling. The behavior is [public-api.md](./public-api.md)'s "No refetch on mount"; this decision is about saying it loudly, since TanStack Query users expect `refetchOnMount`.
- `www/content/comparison.md`'s API map has a row for it: TanStack's `useQuery` refetches stale data on mount; raf-query's read doesn't, and the loader decides.
- Lost: a "Mounting a component never fetches" bullet further down the list (it also read as if a cache miss wouldn't fetch, which it does).
