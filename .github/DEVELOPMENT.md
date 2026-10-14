# Development

This is a Vite+ / pnpm monorepo. The publishable packages live in `packages/`:

| Directory        | npm package        |
| ---------------- | ------------------ |
| `packages/core`  | `@raf-query/core`  |
| `packages/react` | `@raf-query/react` |

Experiments live in `.experimental/` folders, which the release and the root `./packages/*` / `./examples/*` globs don't reach. `packages/.experimental/tanstack-react-query` (`@raf-query/experimental-tanstack-react-query`) is the same API built on TanStack Query instead of raf-query's own engine. It's private, isn't published, and stays at version `0.0.0`. See [its README](../packages/.experimental/tanstack-react-query/README.md).

Each package has its own `README.md`, shown on npm. Root `LICENSE.md` / `CHANGELOG.md` are shared: each package's `prepack` runs [`scripts/sync-package-docs.ts`](../scripts/sync-package-docs.ts), which copies them into the package so the npm tarball includes them without a second copy in git.

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

## Example apps

`examples/` holds the same issue tracker on two frameworks. The packages they share live in `examples/.shared/`. The copies in `examples/.experimental/` run the same app on the experimental `@raf-query/experimental-tanstack-react-query`:

| Directory                                      | What                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `examples/tanstack-start`                      | TanStack Start app, <http://localhost:3000>                            |
| `examples/nextjs`                              | Next.js App Router app, <http://localhost:3001>                        |
| `examples/.experimental/tanstack-query-start`  | TanStack Start app on TanStack Query, <http://localhost:3002>          |
| `examples/.experimental/tanstack-query-nextjs` | Next.js App Router app on TanStack Query, <http://localhost:3003>      |
| `examples/.shared/ui`                          | shadcn/ui components and the Tailwind theme (`@examples/ui`)           |
| `examples/.shared/db`                          | In-memory fake database with latency (`@examples/db`), and its schemas |

They import the libraries' source, so there is nothing to build first. Run them from the root; `pnpm` installs first when `node_modules` is out of date (`verifyDepsBeforeRun` in `pnpm-workspace.yaml`):

```shell
pnpm dev                # TanStack Start, Next.js and the docs site, in parallel
pnpm dev:start          # TanStack Start only
pnpm dev:next           # Next.js only
pnpm dev:experimental   # both apps on TanStack Query
pnpm dev:all            # all four, and the docs site
pnpm build:examples     # production builds of every app, as CI runs them
pnpm preview:examples   # build all four, then serve the production builds
```

Every database call waits the latency picked in the app's top bar, or `DB_LATENCY_MS` (default 400), ± 50%. The top bar also sets how links prefetch. Data the server loads for the first render streams in with the HTML. Later loads (scrolling, filters, opening an issue) are requests to the shared REST API (`examples/.shared/api`) in the browser's network tab, such as `GET /api/issues?status=open&cursor=10`, and mutations are `PATCH` / `POST` to it. Both apps serve the same API under `/api`. Data lives in memory and resets when the server restarts. To add a shadcn component, run `pnpm dlx shadcn@latest add <name>` in `examples/.shared/ui`, then check that it imports `cn` from `@examples/ui/lib/utils` (the CLI can write a bare `"cn"` import and add a `cn` dependency).

### CodeSandbox

CodeSandbox opens one folder of a GitHub repo, but the apps import `@examples/*` and `@raf-query/*` from the workspace. So the `codesandbox` branch holds a standalone copy of each app, and the READMEs link to `codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/<app>`. [`tooling/codesandbox`](../tooling/codesandbox) writes the copies. Each copy is its own pnpm workspace: the app in `apps/<app>` and `examples/.shared/*` copied as-is into `packages/`, so `@examples/*` stay `workspace:*`. `@raf-query/*` become the version in this repo's `packages/*/package.json`. The copy's `pnpm-workspace.yaml` is this repo's with the copy's packages, so it keeps the Vite+ override, and its root `package.json` has this repo's `packageManager` and runs the app's scripts unchanged. CodeSandbox runs the copies on a Linux VM, so `vp` and Turbopack work as they do locally. Each copy has `.devcontainer/devcontainer.json` (CodeSandbox's Node 24 image) and `.codesandbox/tasks.json`, which runs `pnpm install` and then `pnpm dev` with a preview on the app's port. The apps allow CodeSandbox's preview hosts (`*.csb.app`) in `next.config.ts` and `vite.config.ts`.

[`.github/workflows/codesandbox.yaml`](./workflows/codesandbox.yaml) runs `pnpm --filter @tooling/codesandbox sync` after each Release run on `main`. It waits until npm serves the version just published, then installs and builds each copy. It commits the lockfiles and pushes the branch, so a copy that doesn't build isn't pushed. The copies install from the store `actions/setup-node` restores for this repo, and the Next.js copy's Turbopack build cache (`.next/cache`) is kept in the Actions cache between runs. To check the copies locally:

```shell
pnpm --filter @tooling/codesandbox generate /tmp/codesandbox
cd /tmp/codesandbox/examples/nextjs && pnpm install && pnpm dev
```

### Deploying

`examples/tanstack-start` and `examples/nextjs` are each a Vercel project in the `trpc` team, with the app's directory as the root directory and its `vercel.json` setting the install and build commands. Pushes to `main` deploy to production, and pull requests get preview deployments. A project skips the build when nothing it uses changed (`ignoreCommand`). The experimental apps aren't deployed.

| App                       | URL                                         |
| ------------------------- | ------------------------------------------- |
| `examples/tanstack-start` | <https://tanstack-start.raf-query.katt.dev> |
| `examples/nextjs`         | <https://nextjs.raf-query.katt.dev>         |

The Start apps build with Nitro's `nitro()` Vite plugin, which writes Vercel Build Output on Vercel and a Node server in `.output/` elsewhere. Each deployment's database lives in the memory of the function instance that serves it, so edits reset whenever an instance starts, and two instances can show different data.

## Docs site

`www/` is the documentation site at <https://raf-query.katt.dev>: a TanStack Start app, prerendered to static HTML, that renders the markdown in `www/content` and loads each page through raf-query. Pages embed live demos from `www/src/demos`. See [`www/README.md`](../www/README.md) for writing pages and demos, and deploying.

```shell
pnpm dev:www     # http://localhost:3004 (`pnpm dev` starts it too)
pnpm build:www   # static build in www/dist/client, as CI runs it
```

## Formatting

[Vite+ fmt](https://viteplus.dev/) (Oxfmt) is used to format code.
A [husky](https://typicode.github.io/husky) pre-commit hook runs [lint-staged](https://github.com/lint-staged/lint-staged) on staged files: `vp lint --fix` on JS/TS, then `vp fmt` on everything. Fixes are added to the commit; lint errors that can't be auto-fixed block it.

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
2. Writes the version into `packages/core/package.json` and `packages/react/package.json`.
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
