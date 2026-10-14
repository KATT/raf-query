import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { Generator, getConfig } from "@tanstack/router-generator";

/**
 * A page's samples can live in an example app, `content/<page>/`: its own
 * TypeScript project (`tsconfig.json`), so each app's route tree registers
 * its own routes.
 */
export function exampleApps(contentDir: string): ReadonlyArray<string> {
	return readdirSync(contentDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				existsSync(path.join(contentDir, entry.name, "tsconfig.json")),
		)
		.map((entry) => path.join(contentDir, entry.name));
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
