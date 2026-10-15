# Homepage walkthrough (human asked)

- Below a short hero sample (`allKeyed` of two `ensure`s, JSX folded), "How a route loads its data" explains it in two steps after tRPC's quick intro: start queries in the loader, read them in components. Readers know TanStack Query, so factories get a sentence, not a step.
- Samples are `sample:` imports in `www/src/routes/index.tsx` (`import hero from "sample:<app>/<path>#region"`), rendered like a `sample` fence, so they compile with the docs' Twoslash setup; prose is in the same file. Lost: a `www/content/_home-*.md` fragment per sample holding one fence (indirection for nothing, human). The steps are regions of `tanstack-start`'s post route; the hero is `tanstack-start-home`'s (see [docs-sample-packages.md](./docs-sample-packages.md)).
- Lost: only folding the long hero sample: it hides lines without explaining them.
