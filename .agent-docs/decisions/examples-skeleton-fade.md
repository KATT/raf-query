# Example skeletons fade out (agent)

- Suspense fallbacks for whole sections (issue list, issue body, status, assignee card, comments) are wrapped in `FallbackFade` (`examples/.shared/kit/src/components/fallback-fade.tsx`): `<ViewTransition default="none" exit="auto">`. When the data arrives, the skeleton cross-fades out over the content.
- It works because React commits Suspense reveals in retry lanes, which run view transitions, in all four frameworks. No router config needed.
- Only `exit` animates. With any other class, React also names the skeleton to measure it during unrelated transitions nearby, and each of those starts a document view transition, which blocks clicks while it runs.
- Load-more skeletons (`IssueRowSkeletons`, `CommentSkeletons`) aren't wrapped: their updates are synchronous, so nothing would animate.
- Checked by wrapping `document.startViewTransition` in the page: stepping to the next issue at 1 s latency gives three transitions of about 300 ms, each with only `::view-transition-old(<skeleton>)` layers.
