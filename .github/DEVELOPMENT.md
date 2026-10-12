# Development

This is a Vite+ / pnpm monorepo. The publishable packages live in `packages/`:

| Directory        | npm package        |
| ---------------- | ------------------ |
| `packages/core`  | `@raf-query/core`  |
| `packages/react` | `@raf-query/react` |

Root `README.md` / `LICENSE.md` / `CHANGELOG.md` are canonical. Each package's `prepack` runs [`scripts/sync-package-docs.ts`](../scripts/sync-package-docs.ts), which copies them into the package so the npm tarball includes them without a second copy in git.

Scripts live in `scripts/` and are written in TypeScript with Effect, run with plain `node`.

After [forking the repo from GitHub](https://help.github.com/articles/fork-a-repo) and [installing pnpm](https://pnpm.io/installation):

```shell
git clone https://github.com/(your-name-here)/raf-query
cd raf-query
pnpm install
```

## Building

Runs [Vite+ pack](https://viteplus.dev/guide/pack) in every package:

```shell
pnpm build
```

## Formatting

[Vite+ fmt](https://viteplus.dev/) (Oxfmt) is used to format code.
Auto-formatting should happen when you save files in your editor via [lint-staged](https://github.com/lint-staged/lint-staged) and [husky](https://typicode.github.io/husky).

## Testing

```shell
pnpm test
```

## Type Checking

```shell
pnpm typecheck
```

## Linting

```shell
pnpm lint
```

## Releasing / npm publish

Both packages are released together and always share a version. The latest git tag is the version source.

Pushing to `main` runs [`.github/workflows/release.yaml`](./workflows/release.yaml), which runs [release-it](https://github.com/release-it/release-it) from the repo root:

1. Computes the next version from conventional commits since the latest tag and updates `CHANGELOG.md`.
2. Writes the version into every `packages/*/package.json`.
3. Builds, then publishes `@raf-query/core` and `@raf-query/react` (each `pnpm pack` + `npm publish`, using npm trusted publishing over OIDC — no `NPM_TOKEN`). `pnpm pack` rewrites `workspace:*` and `catalog:` to real versions.
4. Only after publishing: commits `chore: release vX.Y.Z`, tags, pushes, and creates a GitHub Release. A failed publish leaves nothing pushed.

Do not set `NODE_AUTH_TOKEN` / `NPM_TOKEN` in the release job — a placeholder token disables OIDC.

### One-time setup

Recreate these when forking, or when adding a new package to `packages/`.

1. **GitHub secret `ACCESS_TOKEN`**: a PAT that can push to `main` and create releases. The workflow checks out and pushes the release commit with it.
2. **npm org `raf-query`**, which owns the `@raf-query` scope: create it at <https://www.npmjs.com/org/create> (free for public packages). The publishing account needs 2FA enabled.
3. **First publish from your machine.** npm only lets you add a trusted publisher to a package that already exists, so each new package is published once by hand. Provenance is CI-only, so turn it off for this publish:

   ```shell
   npm login
   pnpm build
   for pkg in core react; do
   	(cd packages/$pkg && pnpm pack --out package.tgz && npm publish package.tgz --access public --provenance=false && rm package.tgz)
   done
   ```

4. **Trusted publisher** for each package, pointing at this repo's release workflow:

   ```shell
   npm trust github @raf-query/core --file release.yaml --repo KATT/raf-query --allow-publish -y
   npm trust github @raf-query/react --file release.yaml --repo KATT/raf-query --allow-publish -y
   ```

   Or in the UI: package page → **Settings** → **Trusted Publisher** → GitHub Actions, owner `KATT`, repository `raf-query`, workflow `release.yaml`.

After that, consider setting each package to **Require two-factor authentication and disallow tokens** in its npm settings, so only the workflow can publish.
