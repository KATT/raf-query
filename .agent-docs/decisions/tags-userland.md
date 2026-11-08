# Tags are a userland recipe, not part of core (human)

- Core has no `groups()`, `tag`, `Tag` or `TagsMeta`. It keeps the general mechanism tags were built on: a target is any object with `where(query, param)`, `query.meta` is passed in, and `feature<{ meta: … }>()` without a setup function declares typed `meta` for the clients that have it.
- The recipe (docs: `www/content/query-invalidation.md#tags`; sample: `www/samples/tanstack-start/src/docs/query-invalidation.ts#tags`, `#tags-param`):
  ```ts
  const tagged = feature<{ meta: { tags?: ReadonlyArray<string> } }>();
  type Tagged = { readonly tags: ReadonlyArray<string> | undefined };
  const tag = (name: string): Target<Tagged> => ({
  	where: (query) => query.meta.tags?.includes(name) ?? false,
  });
  const tags: Target<Tagged, string> = {
  	where: (query, name) => query.meta.tags?.includes(name) ?? false,
  };
  ```
- `Tagged` spells the field the way a root has it, present and possibly `undefined` ([links-features-meta.md](./links-features-meta.md)). Written as `{ tags?: … }`, the target would fit a client with no declared fields at all (an all-optional type accepts `{}`), so TypeScript wouldn't reject it on a client without `tagged`.
- Why: tags were a few lines of user code wearing a core export, a bundle-size row and a marker. Keeping only `where` and `meta` leaves one way to select queries by what they say, and apps shape tags the way they need (parameters, tags from data through `query.data`, several fields).
- Lost: the parameterized `tag<P>(name)` that built the string (`author("ada")` → `author:"ada"`) and matched with or without a parameter, and `meta.tags` as a function of the data. Both are a few lines in the recipe if an app wants them.
- Test: `packages/core/src/tags-recipe.test.ts` runs the recipe (refetches the read queries that list a tag) and checks that `meta.tags` and the tag targets type only on a client with `tagged`.
