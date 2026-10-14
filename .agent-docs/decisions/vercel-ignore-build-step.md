# Vercel skips a build by diffing from the last deployment (human asked)

- `ignoreCommand` in `www/` and `examples/*/vercel.json` diffs `$VERCEL_GIT_PREVIOUS_SHA..HEAD`, not `HEAD^..HEAD`. A push of several commits whose tip only touches docs skipped the example apps even though an earlier commit changed `packages/`.
- `VERCEL_GIT_PREVIOUS_SHA` is the last successful deployment on the project and branch, so skipped deployments don't move it. It is empty on a branch's first deployment: the `[ -n … ]` guard makes that build (an unguarded `git diff` with no revision compares the clean worktree and would skip).
- If the SHA isn't in Vercel's shallow clone, as after a force-push, `git diff` exits 128. Vercel documents only 0 (skip) and 1 (build), and force-pushed PR branches failed every deployment within about 15 seconds of starting. So the command ends in `|| exit 1`: any failure builds. Building too often beats skipping one that changed.
- Lost: `turbo query affected` (no Turborepo here); `HEAD^` (only the tip commit).
