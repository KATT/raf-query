# PR CI runs only the tests a change affects (agent)

- On `pull_request`, the Test job runs `pnpm test --changed HEAD^1 --passWithNoTests` against the merge commit (base tip is `HEAD^1`; checkout `fetch-depth: 2`). On `push` to `main`, the full suite still runs with `--coverage`.
- Extended Vitest `forceRerunTriggers` in every test config with `pnpm-lock.yaml` and `pnpm-workspace.yaml`. CodeSandbox also watches `examples/**` (tests read that tree via `fs`); pr-title also watches `.release-it.json`.
- Lost: always running the full suite on every PR (safer but slower for docs/CI-only PRs); uploading coverage from partial PR runs (would report 0% for skipped packages).
