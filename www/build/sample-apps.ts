import { Generator, getConfig } from "@tanstack/router-generator";
import { Effect, FileSystem, Path } from "effect";

import { ContentError } from "./content-error.ts";

/**
 * The apps the docs' samples are written against: each folder of `samplesDir`
 * is a workspace package with its own `tsconfig.json`, so each app's route
 * tree registers its own routes.
 */
export const sampleApps = Effect.fn("sampleApps")(function* (
	samplesDir: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const configs = yield* fs.glob("*/tsconfig.json", { root: samplesDir });
	return configs
		.map((file) => path.join(samplesDir, path.dirname(file)))
		.toSorted();
});

/** The app of `apps` (from `sampleApps`) that holds `file`. */
export function appOf(
	path: Path.Path,
	file: string,
	apps: ReadonlyArray<string>,
): string | undefined {
	return apps.find((app) => file.startsWith(`${app}${path.sep}`));
}

/** Writes `src/routeTree.gen.ts` for each sample app with `src/routes`, like TanStack Start's plugin does. */
export const generateRouteTrees = Effect.fn("generateRouteTrees")(function* (
	samplesDir: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const apps = yield* Effect.filter(yield* sampleApps(samplesDir), (app) =>
		fs.exists(path.join(app, "src/routes")),
	);
	yield* Effect.forEach(
		apps,
		(app) =>
			Effect.tryPromise({
				catch: (cause) =>
					new ContentError({
						cause,
						message: `${app}: couldn't generate the route tree`,
					}),
				try: () =>
					new Generator({
						config: getConfig(
							{
								disableLogging: true,
								generatedRouteTree: "./src/routeTree.gen.ts",
								routesDirectory: "./src/routes",
								target: "react",
							},
							app,
						),
						root: app,
					}).run(),
			}),
		{ concurrency: "unbounded", discard: true },
	);
});
