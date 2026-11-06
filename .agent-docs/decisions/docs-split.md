# Docs split (human)

- `www/content`: the documentation, served at raf-query.katt.dev. Guides, the API reference and every public behaviour live here, once.
- Root `README.md`: a taste for GitHub. The pitch, the early-project note, one code sample, install, packages, examples, and links into the docs. No guides or reference tables, so there is nothing to keep in sync with the site.
- `packages/<name>/README.md`: committed per package and shown on npm. What that package is for, install, a short sample, links into the docs. Links are absolute (npm doesn't resolve repo-relative ones). The packages' `prepack` copies only the root `LICENSE.md` and `CHANGELOG.md` (`scripts/sync-package-docs.ts`). `@raf-query/react` shows one `load` sample: the post as an `ensureEntry` (its data read directly) and its comments as a `prefetchEntry` (read with `use()` under Suspense), so both handle kinds show. A second query the component doesn't read (an ensured author) would be the wrong one to show.
- Lost: the root README as the full spec, copied into every package at pack time. Next to the docs site it would duplicate every page, including a full API reference, and npm would show the same text for every package.
- `AGENTS.md`: short environment + pointers agents need every session.
- `.agent-docs/`: durable agent notes (this folder). Agents may reshape it.
