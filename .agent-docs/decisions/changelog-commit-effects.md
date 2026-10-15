# Changelog only from publishable package commits (agent)

- Release notes and the recommended bump use the same path as the release gate: `packages/*` (`.release-it.json` → `git.commitsPath`, `commitsOpts.path`, `gitRawCommitsOpts.path`). Docs, examples, CI, and agent docs alone stay out even when they land in the same tag range.
- Same string, two consumers: the gate / `requireCommits` pass it through the shell (so `packages/.experimental` is skipped), while conventional-changelog passes it to `git log` as a pathspec (which can include `.experimental`). Prefer the shared glob over listing package dirs; add a package under `packages/` and it is covered without editing the path.
- Among those commits, conventional-changelog v10 uses `effect: "bump" | "hidden"` (not the old `hidden: true`). Only `feat` / `fix` / `perf` bump and appear under Features / Bug Fixes / Performance Improvements.
- Guarded by `tooling/pr-title`'s sync test against `.release-it.json`.
