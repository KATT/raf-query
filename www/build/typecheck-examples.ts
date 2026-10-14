/** Typechecks each example app in `content/` as its own project. */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { ContentError } from "./content-error.ts";
import { exampleApps } from "./example-apps.ts";

Effect.gen(function* () {
	const path = yield* Path.Path;
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	const apps = yield* exampleApps(path.join(import.meta.dirname, "../content"));
	const failed = yield* Effect.filter(apps, (app) =>
		Effect.map(
			spawner.exitCode(
				ChildProcess.make("tsc", ["-p", app], {
					stderr: "inherit",
					stdout: "inherit",
				}),
			),
			(exitCode) => exitCode !== 0,
		),
	);
	if (failed.length) {
		return yield* new ContentError({
			message: `\`tsc\` failed in ${failed.join(", ")}`,
		});
	}
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
