# Agents verify with tests and preview links, not videos (human asked)

- Verify programmatically (tests, type checks, builds, `curl`). Computer use is only for UI / UX judgment that needs taste.
- No video demos or screen recordings: slow and token-heavy. The PR description deep-links the Vercel previews of the changed pages instead.
- **Preview URLs come only from the Vercel bot's PR comment** (human, after a guessed `-katt` slug 404'd on #80): wait until the project's deployment is Ready, copy that Preview base URL, then append the path/anchor. Never invent a hostname (team suffix, truncation, and branch slug are not guessable). Lives in `AGENTS.md` ("Verifying changes").
