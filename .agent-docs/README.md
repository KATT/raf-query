# Agent docs

Working memory for coding agents on this repo. **Agents own this folder** — create, edit, and delete freely. Prefer durable facts over chat transcript fluff.

| Doc                                                  | What belongs here                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [decisions.md](./decisions.md)                       | Choices (human or agent) that later work should not quietly reverse                   |
| [origin.md](./origin.md)                             | What the name means and the tooling baseline                                          |
| [implementation-notes.md](./implementation-notes.md) | Verified mechanisms to copy from TanStack / React source, and which package owns what |

## Rules of thumb

- Put **product intent and public API** in root `README.md` (human-facing, “how it works now”), and keep each package's own `README.md` in step with it.
- Put **why we did X / don’t do Y** here so future sessions don’t re-litigate or re-discover.
- When a decision is superseded, update or delete it — don’t accumulate archaeology.
- Don’t duplicate `.github/DEVELOPMENT.md` (how to build/test) or `AGENTS.md` (session boot instructions).
