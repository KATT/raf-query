## Environment

- Node is pinned in `.nvmrc`. The default shell Node may be older; switch first with `eval "$(fnm env)" && fnm use`.
- If `pnpm` fails with `Cannot find module .../corepack/v1/pnpm/<version>/bin/pnpm.cjs`, the installed corepack can't launch the pnpm version in `packageManager`. Upgrade corepack (`npm i -g corepack@latest`) or call the cached binary directly: `~/.cache/node/corepack/v1/pnpm/<version>/pnpm`.

## Verifying changes

- Test programmatically: unit tests, type checks, builds, `curl` against a dev server or a preview. See [`.github/DEVELOPMENT.md`](.github/DEVELOPMENT.md).
- Only use computer use (driving a browser on the VM) for things that need taste: how a UI looks or feels to use. Don't use it to check behavior that a test or a request can check.
- Don't record video demos or screen recordings. They are slow and cost a lot of tokens. Instead, the PR description links to the Vercel previews of the pages the change affects: deep links to the exact page or route (with an anchor when it helps), not just the site root. The Vercel bot's PR comment has the preview base URL for `www` (`raf-query`), `examples/nextjs` (`raf-query-nextjs`) and `examples/tanstack-start` (`raf-query-tanstack-start`); add those links once the deployment is ready.

## Documentation

- The docs site's pages (`www/content`) are the full documentation, API reference included. The root `README.md` and each package's `README.md` are a short taste that links there: don't copy guides or reference tables into them.
- The docs and READMEs describe how raf-query works **now**. Don't reference history: no "since vX", "as of vX", "previously", "no longer", "pre-X.Y.Z", or migration notes. Version history and upgrade notes belong in `CHANGELOG.md` (generated from commit messages on release), so put that context in the commit / PR description instead.
- [`.agent-docs/`](.agent-docs/) is agent-owned working memory (decisions, bootstrap context, notes worth keeping across sessions). Read it when starting non-trivial work; update it when you learn or decide something durable. Edit and delete at will — see [`.agent-docs/README.md`](.agent-docs/README.md).
- Decisions are one file each in `.agent-docs/decisions/`: add a new file rather than appending to an existing one. They hold the short version. For the full reasoning, use git history (`git blame -C -C` on the file, then `gh pr view N --comments` for the `(#N)` in the commit subject), as described in `.agent-docs/README.md`.

<!-- vendor-src:start -->

## Vendored Source

Source for this project's key dependencies is vendored under `.repos/`, pinned to the installed versions. When a question is about how one of these libraries actually behaves, read its vendored source — implementation, tests, examples — instead of relying on docs, memory, or web search. The trees are read-only reference material; see `.repos/AGENTS.md` before touching or citing them.

### Vendored packages

- `@tanstack/react-query@5.104.1` → `.repos/query`
- `@tanstack/react-router@1.170.42` → `.repos/router`
- `effect@4.0.1` → `.repos/effect`

<!-- vendor-src:end -->
