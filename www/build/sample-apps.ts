import { Generator, getConfig } from "@tanstack/router-generator";
import { Effect, FileSystem, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

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

/** Writes `src/routeTree.gen.ts` for each sample app with `src/routes/__root.tsx`, like TanStack Start's plugin does. */
export const generateRouteTrees = Effect.fn("generateRouteTrees")(function* (
	samplesDir: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const apps = yield* Effect.filter(yield* sampleApps(samplesDir), (app) =>
		fs.exists(path.join(app, "src/routes/__root.tsx")),
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

/** Runs an app's own CLI from its `node_modules/.bin`, failing on a nonzero exit. */
const runBin = Effect.fn("runBin")(function* (
	app: string,
	bin: string,
	args: ReadonlyArray<string>,
) {
	const path = yield* Path.Path;
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	const command = [bin, ...args].join(" ");
	const exitCode = yield* spawner
		.exitCode(
			ChildProcess.make(path.join(app, "node_modules/.bin", bin), args, {
				cwd: app,
				stderr: "inherit",
				stdout: "ignore",
			}),
		)
		.pipe(
			Effect.mapError(
				(cause) =>
					new ContentError({
						cause,
						message: `${app}: couldn't run ${command}`,
					}),
			),
		);
	if (exitCode !== 0) {
		return yield* new ContentError({
			message: `${app}: ${command} exited with ${exitCode}`,
		});
	}
});

/** Writes `.react-router/types` for each sample app with `react-router.config.ts`, like `react-router typegen`. */
export const generateRouteTypes = Effect.fn("generateRouteTypes")(function* (
	samplesDir: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const apps = yield* Effect.filter(yield* sampleApps(samplesDir), (app) =>
		fs.exists(path.join(app, "react-router.config.ts")),
	);
	yield* Effect.forEach(
		apps,
		(app) => runBin(app, "react-router", ["typegen"]),
		{
			concurrency: "unbounded",
			discard: true,
		},
	);
});

/**
 * Writes `.svelte-kit/` and `node_modules/$app/tsconfig.json` for each sample
 * app with SvelteKit, like `svelte-kit sync`: its `tsconfig.json` extends the
 * generated one, and its routes import the generated `./$types`.
 */
export const syncKitApps = Effect.fn("syncKitApps")(function* (
	samplesDir: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const apps = yield* Effect.filter(yield* sampleApps(samplesDir), (app) =>
		fs.exists(path.join(app, "node_modules/.bin/svelte-kit")),
	);
	yield* Effect.forEach(apps, (app) => runBin(app, "svelte-kit", ["sync"]), {
		concurrency: "unbounded",
		discard: true,
	});
});
