# Example apps edit like Linear (human asked, agent designed)

- Human: make the example projects more fun and more like Linear — edit title in place, change status from the list.
- **Inline title and body**: the detail page's title and description are the inputs themselves (hover/focus tint, Enter / blur saves, Escape cancels). No separate "Rename" form. Still Form Actions + `useOptimistic` + `await qc.invalidate`.
- **Status from the list (and properties panel)**: each row's status badge opens a dropdown; choosing a status PATCHes optimistically. The detail page's sidebar has a Properties panel with the same control. List rows are no longer a single link wrapping the badge (invalid nested interactive), so the id/title link and the status control sit side by side.
- **API**: `PATCH /api/issues/:id` accepts optional `title`, `status`, and `body` (`UpdateIssueFields` / `UpdateIssueInput` in `@examples/db/types`). `updateIssue` already supported status; body was added to match.
- Lost: the always-visible title input + Rename button; a read-only status badge on the list and detail.
