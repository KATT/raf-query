# Tags are a userland recipe, not part of core (human)

- Core has no `groups()`, `tag`, `Tag` or tags option. It keeps the general mechanism tags are built on: a target is any object with `where(query, param)`, `query.options` is passed in, and `plugin<{ options: … }>()` without a definition declares typed options for the clients that have it ([parts-options-context.md](./parts-options-context.md)).
- The recipe (docs: `www/content/query-invalidation.md#tags`; sample: `www/samples/tanstack-start/src/docs/query-invalidation.ts#tags`, `#tags-param`):
  ```ts
  interface Tags {
  	readonly options: { readonly tags?: ReadonlyArray<string> };
  }
  const tagged = plugin<Tags>();
  type Tagged = { readonly tags: ReadonlyArray<string> | undefined };
  const tag = (name: string): Target<Tagged> => ({
  	where: (query) => query.options.tags?.includes(name) ?? false,
  });
  const tags: Target<Tagged, string> = {
  	where: (query, name) => query.options.tags?.includes(name) ?? false,
  };
  ```
- `Tagged` spells the option the way a root has it, present and possibly `undefined`. Written as `Tags["options"]` (`{ tags?: … }`), the target would fit a client with no declared options at all (an all-optional type accepts `{}`), so TypeScript wouldn't reject it on a client without `tagged`.
- Why: tags were a few lines of user code wearing a core export, a bundle-size row and a marker. Keeping only `where` and declared options leaves one way to select queries by what they say, and apps shape tags the way they need (parameters, tags from data through `query.data`, several options).
- Lost: the parameterized `tag<P>(name)` that built the string (`author("ada")` → `author:"ada"`) and matched with or without a parameter, and `tags` as a function of the data. Both are a few lines in the recipe if an app wants them.
- Test: `packages/core/src/keys/tags-recipe.test.ts` runs the recipe (refetches the read queries that list a tag) and checks that `tags` and the tag targets type only on a client with `tagged`.
