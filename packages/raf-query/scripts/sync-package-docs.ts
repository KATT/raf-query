#!/usr/bin/env node
/**
 * Copy the repo-root README.md / LICENSE.md (canonical, shown on GitHub) into
 * this package so `npm pack` / `npm publish` include them.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path } from "effect";

Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const pkg = path.join(import.meta.dirname, "..");
	const root = path.join(pkg, "..", "..");

	for (const name of ["README.md", "LICENSE.md"]) {
		yield* fs.copyFile(path.join(root, name), path.join(pkg, name));
		yield* Console.log(`synced ${name} → packages/raf-query/${name}`);
	}
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
