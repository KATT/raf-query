# A release run stops if `main` moved (agent)

- A release run publishes to npm before it pushes `chore: release vX.Y.Z`. If anything merges while it builds, the `--atomic` push is rejected (non-fast-forward) after the packages are on npm, leaving a version with no tag or commit (0.5.4 is one: PRs #74–#78 merged within half a minute).
- So `before:git:release` fetches `origin/main` after building and stops before publishing if it isn't `HEAD`. The workflow treats that stop as a success: the `concurrency` group holds the run for the newest commit, and that run releases everything.
- The window that remains is the publish itself (a few seconds). Merging one PR at a time and waiting for its release avoids it.
