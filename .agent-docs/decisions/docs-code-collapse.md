# Folded code lines (human asked)

- The homepage hero sample folds its JSX (human): the loader and both typed `useQuery` calls stay visible, and the fold opens and closes. Every line doesn't have to be on screen to see the point.
- Any fence can fold a range with `// ---collapse---` and `// ---/collapse---` on their own lines (`www/build/collapse.ts`). The fold runs after Twoslash, so a pinned type inside the range stays with those lines. An unclosed, empty, or nested range fails the build. Copy includes the lines. Agent markdown keeps the lines and drops the markers.
- Lost: Expressive Code (Astro's docs fold this way, but the plugin would replace Shiki and Twoslash), clipping the block to a max height (the cut depends on wrapping and the type row's height), and `// ---cut-start---` (those lines are deleted, so they can't be opened).
