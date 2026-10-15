# Docs split (human)

- `www/content`: the documentation, served at raf-query.katt.dev. Guides, the API reference and every public behaviour live here, once.
- Root `README.md`: a taste for GitHub. The pitch, the early-project note, one code sample, install, packages, examples, and links into the docs. No guides or reference tables, so there is nothing to keep in sync with the site.
- `packages/<name>/README.md`: committed per package and shown on npm. What that package is for, install, one sample, links into the docs. Links are absolute (npm doesn't resolve repo-relative ones). The packages' `prepack` copies only the root `LICENSE.md` and `CHANGELOG.md` (`scripts/sync-package-docs.ts`).
- Lost: the root README as the full spec, copied into both packages at pack time. With the docs site it duplicated every page, including a full API reference, and npm showed the same text for core and react.
- `AGENTS.md`: short environment + pointers agents need every session.
- `.agent-docs/`: durable agent notes (this folder). Agents may reshape it.
