# Development

This is a Vite+ / pnpm monorepo. The publishable package lives in `packages/raf-query`.

Root `README.md` / `LICENSE.md` are canonical. They are copied into `packages/raf-query` on `prepack` (and before npm publish) by `packages/raf-query/scripts/sync-package-docs.ts` so the npm tarball includes them without maintaining a second copy in git.

Scripts live in `packages/raf-query/scripts/` and are written in TypeScript with Effect, run with plain `node`.

After [forking the repo from GitHub](https://help.github.com/articles/fork-a-repo) and [installing pnpm](https://pnpm.io/installation):

```shell
git clone https://github.com/(your-name-here)/raf-query
cd raf-query
pnpm install
```

## Building

Run [Vite+ pack](https://viteplus.dev/guide/pack) for `packages/raf-query`:

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

Pushing to `main` runs [`.github/workflows/release.yaml`](./workflows/release.yaml). [release-it](https://github.com/release-it/release-it) bumps `packages/raf-query`, updates `CHANGELOG.md`, tags, creates a GitHub Release, then `pnpm pack` + `npm publish` (OIDC trusted publishing — no `NPM_TOKEN`).

One-time setup (already done for this repo when documented here; recreate if forking):

1. **GitHub secret `ACCESS_TOKEN`** — a PAT with `repo` (and ability to push to `main` / create releases). The workflow checks out and pushes the release commit with this token.
2. **npm trusted publisher** for package `raf-query`:
   - GitHub user/org: `KATT`
   - Repository: `raf-query`
   - Workflow filename: `release.yaml` (filename only)
   - Allow `npm publish`
   - CLI: `npm trust github raf-query --file release.yaml --repo KATT/raf-query --allow-publish -y`
   - Or UI: https://www.npmjs.com/package/raf-query/access after the first publish exists / from npm account package settings

Do not set `NODE_AUTH_TOKEN` / `NPM_TOKEN` in the release job — a placeholder token disables OIDC.
