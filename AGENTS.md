## Environment

- Node is pinned in `.nvmrc`. The default shell Node may be older; switch first with `eval "$(fnm env)" && fnm use`.
- If `pnpm` fails with `Cannot find module .../corepack/v1/pnpm/<version>/bin/pnpm.cjs`, the installed corepack can't launch the pnpm version in `packageManager`. Upgrade corepack (`npm i -g corepack@latest`) or call the cached binary directly: `~/.cache/node/corepack/v1/pnpm/<version>/pnpm`.

## Documentation

- `README.md` describes how raf-query works **now**. Don't reference history: no "since vX", "as of vX", "previously", "no longer", "pre-X.Y.Z", or migration notes. Version history and upgrade notes belong in `packages/raf-query/CHANGELOG.md` (generated from commit messages on release), so put that context in the commit / PR description instead.
- [`.agent-docs/`](.agent-docs/) is agent-owned working memory (decisions, bootstrap context, notes worth keeping across sessions). Read it when starting non-trivial work; update it when you learn or decide something durable. Edit and delete at will — see [`.agent-docs/README.md`](.agent-docs/README.md).

<!-- vendor-src:start -->

## Vendored Source

Source for this project's key dependencies is vendored under `.repos/`, pinned to the installed versions. When a question is about how one of these libraries actually behaves, read its vendored source — implementation, tests, examples — instead of relying on docs, memory, or web search. The trees are read-only reference material; see `.repos/AGENTS.md` before touching or citing them.

### Vendored packages

- `@tanstack/react-query@5.104.1` → `.repos/query`

<!-- vendor-src:end -->
