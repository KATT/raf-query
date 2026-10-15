# Docs code blocks use Expressive Code (agent)

- Every fence is rendered by Expressive Code (`rehype-expressive-code`), with the `github-light` and `github-dark` themes. The site's `.dark` class picks the dark theme. The card, title, and copy button stay ours (`frames: false`), so a block still matches the rest of the page.
- Twoslash still compiles `twoslash` fences first, on TypeScript 6, with the same virtual project (`www/build/expressive-code.ts`). Expressive Code then highlights the code left after `// ---cut---`. Hover popups, pinned `// ^?` types, and `// @errors` are drawn onto those lines. An unexpected error still fails the build. Popup types are highlighted as `ts` or `tsx`.
- Copy joins Expressive Code's lines. Those lines are elements, with no newline between them, and the type chrome is left out.
- Lost: `@shikijs/rehype` with Twoslash as a Shiki transformer. Expressive Code's highlighter cannot change the text, so Twoslash has to run first. Also lost: Expressive Code's own frame and copy button, which would replace the card.
