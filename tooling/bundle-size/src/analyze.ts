#!/usr/bin/env node
/**
 * Bundle one fixture and list the modules that end up in it, largest first
 * (bytes as rendered into the chunk, before minification). Use it to find
 * what to cut after `measure.ts` shows a size change.
 *
 * Usage: node src/analyze.ts [fixture] [--top N]
 *   fixture  file under `fixtures/` (default `hooks.tsx`)
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Path } from "effect";

import { bundle } from "./bundle.ts";

Effect.gen(function* () {
	const path = yield* Path.Path;
	const argv = process.argv.slice(2);
	const topIndex = argv.indexOf("--top");
	const top = topIndex === -1 ? 40 : Number(argv[topIndex + 1]);
	const [fixture = "hooks.tsx"] = argv.filter(
		(arg, index) =>
			!arg.startsWith("--") && (topIndex === -1 || index !== topIndex + 1),
	);
	const output = yield* bundle(
		path.join(import.meta.dirname, "../fixtures", fixture),
		{ dist: false },
	);
	const modules = [...output.modules]
		.map(([id, bytes]) => ({
			bytes,
			id: id.replace(/^.*node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?/, ""),
		}))
		.toSorted((a, b) => b.bytes - a.bytes);
	const total = modules.reduce((sum, module) => sum + module.bytes, 0);
	yield* Console.log(
		`${fixture}: ${(output.gzip / 1024).toFixed(2)} kB gzip, ${total} bytes before minification; by module:\n`,
	);
	for (const module of modules.slice(0, top)) {
		yield* Console.log(`${String(module.bytes).padStart(7)}  ${module.id}`);
	}
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
