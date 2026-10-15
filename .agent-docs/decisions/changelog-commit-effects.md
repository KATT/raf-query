# Changelog only from publishable package commits (agent)

- Release notes and the recommended bump use the same path as the release gate: `packages/*` (`.release-it.json` → `git.commitsPath`, `commitsOpts.path`, `gitRawCommitsOpts.path`). Docs, examples, CI, agent docs, and `.experimental/*` alone stay out even when they land in the same tag range.
- Experiments live under top-level `.experimental/` (see [experiment-tanstack-react-query.md](./experiment-tanstack-react-query.md)), so `packages/*` means the same thing as a shell glob and as a git pathspec.
- Among those commits, conventional-changelog v10 uses `effect: "bump" | "hidden"` (not the old `hidden: true`). Only `feat` / `fix` / `perf` bump and appear under Features / Bug Fixes / Performance Improvements.
- Guarded by `tooling/pr-title`'s sync test against `.release-it.json`.
