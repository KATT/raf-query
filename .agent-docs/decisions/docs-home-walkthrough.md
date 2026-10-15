# Homepage walks through how a route loads its data (human asked)

- Below the hero, "How a route loads its data" explains the hero's example in three numbered steps, modeled on tRPC's homepage quick intro (human): describe the queries, start them in the route loader, read them in components. Each step is prose beside a Twoslash sample, with a link to its guide.
- The samples are fragments, `www/content/_home-queries.md`, `_home-loader.md` and `_home-component.md`, so they compile with the docs' Twoslash setup. The prose lives in `www/src/routes/index.tsx`.
- Lost: folding the hero sample's JSX behind "N collapsed lines" (human: explain instead of hiding lines). Folding may still suit other pages; the implementation is commit `6da2258826` on the `cursor/homepage-code-collapse-f562` branch.
