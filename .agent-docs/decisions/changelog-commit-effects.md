# Changelog uses effect, not hidden (agent)

- `@release-it/conventional-changelog` loads `conventional-changelog-conventionalcommits` v10+, which gates changelog lines and version bumps with `effect: "bump" | "hidden"`. The older `hidden: true` field is ignored: those types default to bump and still print (often as uncategorized bullets with no section heading).
- `.release-it.json` preset types set `effect` explicitly. Only `feat` / `fix` / `perf` bump and appear under Features / Bug Fixes / Performance Improvements; `build`, `chore`, `ci`, `docs`, `refactor`, `style`, and `test` stay off the release notes and do not recommend a bump on their own.
- Guarded by `tooling/pr-title`'s sync test against `.release-it.json`, so a `hidden: true` regression fails CI.
