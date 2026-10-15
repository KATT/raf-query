# Changelog only from publishable package commits (agent)

- Release notes and the recommended bump read the same commits as the release gate: only those that touch `packages/core` or `packages/react` (`.release-it.json` → `commitsOpts.path` / `gitRawCommitsOpts.path`). Docs, examples, CI, agent docs, and `packages/.experimental` alone stay out even when they land in the same tag range.
- Paths are listed explicitly, not `packages/*`: a git pathspec `packages/*` includes `.experimental`, while the shell glob in `git.commitsPath` / the workflow gate does not. Keep the three lists in sync when a publishable package is added.
- Among those commits, conventional-changelog v10 uses `effect: "bump" | "hidden"` (not the old `hidden: true`). Only `feat` / `fix` / `perf` bump and appear under Features / Bug Fixes / Performance Improvements.
- Guarded by `tooling/pr-title`'s sync test against `.release-it.json`.
