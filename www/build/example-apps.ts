import { existsSync, globSync } from "node:fs";
import path from "node:path";

import { Generator, getConfig } from "@tanstack/router-generator";

/**
 * A page's samples live in example apps under `content/<page>/`: the folder
 * itself, or folders inside it when the page shows versions of the same
 * file (`content/<page>/<version>/`). Each app is its own TypeScript project
 * (`tsconfig.json`), so each app's route tree registers its own routes.
 */
export function exampleApps(contentDir: string): ReadonlyArray<string> {
	return globSync("*/**/tsconfig.json", {
		cwd: contentDir,
		exclude: ["**/node_modules/**"],
	})
		.map((file) => path.join(contentDir, path.dirname(file)))
		.toSorted();
}

/** The example app `file` is in: the closest folder with a `tsconfig.json`. */
export function appOf(file: string, contentDir: string): string | undefined {
	let dir = path.dirname(file);
	while (dir.startsWith(`${contentDir}${path.sep}`)) {
		if (existsSync(path.join(dir, "tsconfig.json"))) {
			return dir;
		}
		dir = path.dirname(dir);
	}
	return undefined;
}

/** Writes `src/routeTree.gen.ts` for each example app with `src/routes`, like TanStack Start's plugin does. */
export async function generateRouteTrees(contentDir: string) {
	await Promise.all(
		exampleApps(contentDir)
			.filter((app) => existsSync(path.join(app, "src/routes")))
			.map((app) =>
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
			),
	);
}
