import { gzipSync } from "node:zlib";

import react from "@vitejs/plugin-react";
import { Effect, Path } from "effect";
import { build } from "vite";

/** Shipped either way, so it's left out of every bundle. */
const reactExternal = /^(react|react-dom|scheduler)($|\/)/;

export interface Bundle {
	readonly code: string;
	readonly gzip: number;
	/** Modules with code in the output, by id, with their rendered bytes. */
	readonly modules: ReadonlyMap<string, number>;
}

/**
 * Bundle `entry` minified, the way an app's client build would, with
 * raf-query resolved from the packages' `src/` (or their built `dist/`).
 */
export const bundle = Effect.fn("bundle")(function* (
	entry: string,
	options: { readonly dist: boolean },
) {
	const path = yield* Path.Path;
	const packageDir = path.join(import.meta.dirname, "..");
	const packages = path.join(packageDir, "../../packages");
	const built = (pkg: string, module: string) =>
		path.join(packages, pkg, `dist/${module}.mjs`);
	const alias = options.dist
		? [
				{ find: /^@raf-query\/core$/, replacement: built("core", "index") },
				{
					find: /^@raf-query\/core\/internal$/,
					replacement: built("core", "internal"),
				},
				{ find: /^@raf-query\/react$/, replacement: built("react", "index") },
				{
					find: /^@raf-query\/boundary$/,
					replacement: built("boundary", "index"),
				},
			]
		: [];
	const result = yield* Effect.promise(() =>
		build({
			build: {
				minify: true,
				modulePreload: false,
				rolldownOptions: { external: [reactExternal], input: entry },
				write: false,
			},
			configFile: false,
			logLevel: "silent",
			mode: "production",
			plugins: [react()],
			resolve: { alias },
			root: packageDir,
		}),
	);
	const outputs = Array.isArray(result)
		? result
		: "output" in result
			? [result]
			: [];
	const chunks = outputs
		.flatMap((output) => output.output)
		.flatMap((file) => (file.type === "chunk" ? [file] : []));
	const code = chunks.map((chunk) => chunk.code).join("\n");
	const modules = new Map<string, number>();
	for (const chunk of chunks) {
		for (const [id, info] of Object.entries(chunk.modules)) {
			if (info.renderedLength > 0) {
				modules.set(id, info.renderedLength);
			}
		}
	}
	const gzip = chunks.reduce(
		(sum, chunk) => sum + gzipSync(chunk.code, { level: 9 }).length,
		0,
	);
	return { code, gzip, modules } satisfies Bundle;
});
