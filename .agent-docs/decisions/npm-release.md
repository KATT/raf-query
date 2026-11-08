# npm release path

- release-it + GitHub Actions: push to `main` → `.github/workflows/release.yaml`, run from the repo root (`.release-it.json`). Setup steps live in `.github/DEVELOPMENT.md`.
- Only publishes when `packages/*` changed since the latest tag (`git.commitsPath` + workflow gate). See [release-requires-package-commits.md](./release-requires-package-commits.md).
- `npm: false` in release-it: the **latest git tag is the version source**; an `after:bump` hook writes the version into every `packages/*/package.json`.
- **Publish before git**: `before:git:release` builds and publishes core, then react, so a failed publish pushes no commit or tag. Git first would leave a `chore: release` commit and its tag pushed for a version npm doesn't have.
- 0.0.1 is a hand publish that bootstraps trusted publishing, tagged at its commit with a hand-made GitHub Release, so CI has nothing to release for it. Each package has a `0.0.0-stage` stub version npm adds on creation; it's npm-managed and left alone.
- `npm publish` from an agent shell fails with `EOTP` (2FA web auth needs an interactive terminal); manual publishes have to be run by the user.
- Publishes via npm OIDC trusted publishing (`id-token: write`, empty `NODE_AUTH_TOKEN`). npm only allows a trusted publisher on a package that exists, so every new package needs one manual first publish (with `--provenance=false`) before `npm trust github`.
- Locally, nested `pnpm` calls from `pnpm -r` scripts hit the broken corepack shim described in `AGENTS.md`; put the cached pnpm binary first on `PATH` (a symlink named `pnpm`) when running root scripts.
