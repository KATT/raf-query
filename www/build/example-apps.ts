import { Generator, getConfig } from "@tanstack/router-generator";
import { Effect, FileSystem, Path } from "effect";

import { ContentError } from "./content-error.ts";

/**
 * A page's samples live in example apps under `content/<page>/`: the folder
 * itself, or folders inside it when the page shows versions of the same
 * file (`content/<page>/<version>/`). Each app is its own TypeScript project
 * (`tsconfig.json`), so each app's route tree registers its own routes.
 */
export const exampleApps = Effect.fn("exampleApps")(function* (
	contentDir: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const configs = yield* fs.glob("*/**/tsconfig.json", {
		exclude: ["**/node_modules/**"],
		root: contentDir,
	});
	return configs
		.map((file) => path.join(contentDir, path.dirname(file)))
		.toSorted();
});

/**
 * The example app `file` is in: the closest of `apps` (from `exampleApps`)
 * that holds it. `apps` is sorted, so an app sorts after the apps it's in.
 */
export function appOf(
	path: Path.Path,
	file: string,
	apps: ReadonlyArray<string>,
): string | undefined {
	return apps.findLast((app) => file.startsWith(`${app}${path.sep}`));
}

/** Writes `src/routeTree.gen.ts` for each example app with `src/routes`, like TanStack Start's plugin does. */
export const generateRouteTrees = Effect.fn("generateRouteTrees")(function* (
	contentDir: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const apps = yield* Effect.filter(yield* exampleApps(contentDir), (app) =>
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
