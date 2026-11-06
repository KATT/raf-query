# Keys, groups and tags (human asked, agent built; provisional)

- **Provisional:** the design is waiting for sign-off. Everything that parses or matches keys sits behind one internal seam, `packages/core/src/keys.ts`, so it can change without touching the rest of the kernel.
- A key is plain JSON: a factory's `queryKey` array, hashed with sorted object fields. Keys look the same in memory, on the wire and in devtools.
- Invalidation is typed and tied to factories and targets, never raw keys: `invalidateOne(qc, factory, input)`, `invalidateMany(qc, factory, partialInput?)`, `invalidateMany(qc, group)`, `invalidateMany(qc, tagOrWhere, param?)`.
- **Groups** are frozen plain data, branded only in the types: `group("drafts", posts)` is `{ group: "posts/drafts" }`. A group goes first in a key, and a group target matches every key whose first segment is that group or a subgroup of it. No key spreading, and no `/*#__PURE__*/` in user code.
- **Tags and `where` predicates** live in `meta` and never enter keys. `tag<P>(name)` targets need the `groups()` feature on the client, which declares `meta.tags`.
- The client's types come from its parts (tRPC v12 style): links and features declare the `meta` fields they read, `createQueryClient` intersects them, and factories opt in to that root with `def: defType<typeof makeQueryClient>()`. No global `Register`, no module-level client.
- Lost: string or array key filters, `matchesKey`, and group functions inside keys (they don't survive `structuredClone` or the wire).
- Where: `packages/core/src/keys.ts`, `groups.ts`, `root.ts`, `verbs.ts`; types in `types.test.ts`.
