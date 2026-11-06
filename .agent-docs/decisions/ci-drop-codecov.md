# CI does not upload coverage to Codecov (agent)

- The Test job runs without `codecov/codecov-action` and `--coverage`. Without a `CODECOV_TOKEN` the upload fails with HTTP 429 and the step exits 0 anyway, so it only hides a failure.
- Local `pnpm test --coverage` and the packages' coverage config stay. Lost: keeping a broken upload “for later”; wiring `CODECOV_TOKEN` + `codecov-action@v5` (the owner can add it to get reports).
