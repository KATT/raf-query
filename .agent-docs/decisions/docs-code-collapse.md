# Folded code lines (human asked)

- The homepage sample folds the JSX and the `Comments` function (human): the loader and the typed `useQuery` stay visible, and each folded range opens and closes. Every line doesn't have to be on screen to see the point.
- Folds are Expressive Code's collapsible sections (`@expressive-code/plugin-collapsible-sections`), on top of the Expressive Code highlighter. A fence marks them with `collapse={4-9}` (and more ranges, comma-separated). The style is `collapsible-start`: closed, the summary says “N collapsed lines”; open, that label hides and a collapse icon stays on the summary, and a second click closes the lines. Copy includes the lines. Tailwind's `collapse` utility and the prose `details` box are reset inside the code block so that icon stays visible.
- The line numbers are the lines Expressive Code highlights, which is the code left after Twoslash's `// ---cut---` and `// ^?`. A pinned type is rendered inside its line, so it opens and closes with that line.
- Lost: comment markers, which name a range without counting lines, and Expressive Code's default `github` style, which cannot close again.
