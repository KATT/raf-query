# Icon-only controls have tooltips

- **Every button or link that shows only an icon has a `title`** (human asked, project wide: docs site and example apps), matching its `aria-label`. Includes controls whose text hides at small widths, like the docs search button.
- Native `title`, not a Tooltip component: the UI kit has none, and `title` needs no provider in each app.
