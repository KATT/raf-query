# Brand colors and logo (human asked, agent designed)

- Human: find a color theme to put on the shared UI package and the logo, inspired by tRPC (also theirs) and/or TanStack Query.
- **Palette**: tRPC's blue blended through violet into TanStack Query's coral, plus TanStack's amber: `#3B8EEA`, `#7B5CFF`, `#FF4D6D`, `#FFB547`. Violet, the blend of the two, is the primary. They're the `--color-brand-*` tokens (with `-ink` text shades) in `examples/.shared/ui/src/styles/globals.css`, and the `bg-brand-gradient` utility.
- **Logo**: a gradient tile (blue at top left, coral at bottom right) with a white lowercase "r" and a dot: render, and a request in flight. `.github/assets/logo.svg` is for the README. The apps use the same SVG as a string in `examples/.shared/ui/src/lib/logo.ts` (a data URL for the `<Logo>` `<img>` and the favicon), because Next and Vite import static files differently. Keep the two copies the same.
- The README loads the logo from a `raw.githubusercontent.com` URL on `main`, because the README is copied into the npm packages, where a relative path doesn't resolve.
- Neutrals have a slight violet tint (hue 286). Dark mode follows `prefers-color-scheme` (`@custom-variant dark` is a media query, not a `.dark` class), as the devtools panel already does. The apps have no theme toggle.
- Issue status colors: open is blue, in progress is amber, closed is violet. These are the `Badge` variants `blue` / `amber` / `violet` (and `coral`), plus `StatusDot` in each app's `status-badge.tsx`.
- Devtools (`packages/react/src/devtools-panel.tsx`): the accent and selected row are violet, and the toggle's dot is the brand gradient. Query status colors (fresh, stale, fetching…) stay semantic, not brand.
- Lost: one brand color, either blue or coral (that reads as tRPC or as TanStack, not as both); a list-of-bars mark (it looks like a generic "align left" icon); an amber dot in the logo (it disappears at 16px).
