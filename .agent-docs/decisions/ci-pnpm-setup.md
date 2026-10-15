# CI installs pnpm via `pnpm/setup` (agent)

- Replaced `pnpm/action-setup@v4` with `pnpm/setup@v3` in `.github/actions/prepare`. v3 downloads pnpm 12's native binary (with signature checks) instead of installing it like an npm package.
- Kept `actions/setup-node` for Node (runner tool cache) and `cache: pnpm`. Set `install: false` and `node-version-file: false` so setup only puts pnpm on PATH; we still run `pnpm install --frozen-lockfile` ourselves.
- Lost: staying on `pnpm/action-setup` (works, but ~5s slower per job on the self-install).
