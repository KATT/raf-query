#!/usr/bin/env node
/**
 * Copy the repo-root README.md / LICENSE.md / CHANGELOG.md (canonical, shown
 * on GitHub) into the package being packed, so `pnpm pack` / `npm publish`
 * include them. Runs from a package's `prepack`, so cwd is that package.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path } from "effect";

Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = path.join(import.meta.dirname, "..");
	const pkg = process.cwd();

	for (const name of ["README.md", "LICENSE.md", "CHANGELOG.md"]) {
		yield* fs.copyFile(path.join(root, name), path.join(pkg, name));
		yield* Console.log(`synced ${name} → ${path.relative(root, pkg)}/${name}`);
	}
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
