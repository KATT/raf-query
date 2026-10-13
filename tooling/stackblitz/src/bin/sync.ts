#!/usr/bin/env node
/**
 * Regenerates the `stackblitz` branch from this checkout and pushes it to
 * `origin`. `.github/workflows/stackblitz.yaml` runs it after Release, once
 * the version in `packages/*` is published.
 *
 * Usage: pnpm --filter @tooling/stackblitz sync
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer, Path } from "effect";
import { FetchHttpClient } from "effect/http";

import { branch, publishedVersions, writeCopies } from "../copies.ts";
import { NpmRegistry, waitForVersions } from "../registry.ts";
import { Builder, syncBranch } from "../sync.ts";

Effect.gen(function* () {
	const path = yield* Path.Path;
	const root = path.join(import.meta.dirname, "../../../..");
	yield* syncBranch(root, "origin", branch, (dir) =>
		writeCopies(root, dir).pipe(
			Effect.tap(() =>
				publishedVersions(root).pipe(
					Effect.flatMap((packages) =>
						waitForVersions(packages, 30, "20 seconds"),
					),
				),
			),
		),
	);
}).pipe(
	Effect.provide(
		Layer.mergeAll(Builder.layer, NpmRegistry.layer).pipe(
			Layer.provideMerge(
				Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer),
			),
		),
	),
	NodeRuntime.runMain,
);
