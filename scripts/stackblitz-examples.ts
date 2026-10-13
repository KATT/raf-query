#!/usr/bin/env node
/**
 * Write a standalone copy of each example app into <dir>, for StackBlitz to
 * open one folder at a time (`stackblitz.com/github/<repo>/tree/<branch>/examples/<app>`).
 * In the monorepo the apps import `@examples/db`, `@examples/ui` and
 * `@raf-query/react` from the workspace, which a single folder doesn't have:
 * each copy gets the shared packages in `shared/` as `file:` dependencies, and
 * the published `@raf-query/*` version.
 *
 * Usage: node scripts/stackblitz-examples.ts <dir>
 * Replaces everything in <dir> except `.git`.
 * `.github/workflows/stackblitz.yaml` runs it and pushes <dir> to the
 * `stackblitz` branch.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path } from "effect";

const repo = "KATT/raf-query";
const apps = ["nextjs", "tanstack-start"];
const sharedPackages = ["db", "ui"];
const ignored = new Set([
	".DS_Store",
	".next",
	".output",
	".tanstack",
	"coverage",
	"dist",
	"next-env.d.ts",
	"node_modules",
]);
const gitignore = [
	"node_modules",
	".next",
	".output",
	".tanstack",
	"dist",
	"next-env.d.ts",
	"*.tsbuildinfo",
];

interface PackageJson {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	name: string;
	scripts?: Record<string, string>;
	version: string;
}

interface StackBlitzConfig {
	env: Record<string, string>;
	installDependencies: boolean;
	startCommand: string;
}

Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = path.join(import.meta.dirname, "..");
	const dir = process.argv[2];
	if (dir === undefined) {
		return yield* Effect.die(
			"Usage: node scripts/stackblitz-examples.ts <dir>",
		);
	}
	const out = path.resolve(dir);

	const readJson = (file: string) =>
		fs
			.readFileString(file)
			.pipe(Effect.map((text): PackageJson => JSON.parse(text)));
	const writeJson = (file: string, value: PackageJson | StackBlitzConfig) =>
		fs.writeFileString(file, `${JSON.stringify(value, null, "\t")}\n`);

	const copyTree = Effect.fn("copyTree")(function* (from: string, to: string) {
		const entries = yield* fs.readDirectory(from, { recursive: true });
		for (const entry of entries) {
			if (
				entry
					.split(path.sep)
					.some((part) => ignored.has(part) || part.endsWith(".tsbuildinfo"))
			) {
				continue;
			}
			const info = yield* fs.stat(path.join(from, entry));
			if (info.type !== "File") {
				continue;
			}
			yield* fs.makeDirectory(path.dirname(path.join(to, entry)), {
				recursive: true,
			});
			yield* fs.copyFile(path.join(from, entry), path.join(to, entry));
		}
	});

	const published = new Map<string, string>();
	for (const name of ["core", "react"]) {
		const pkg = yield* readJson(
			path.join(root, "packages", name, "package.json"),
		);
		published.set(pkg.name, pkg.version);
	}

	yield* fs.makeDirectory(out, { recursive: true });
	for (const entry of yield* fs.readDirectory(out)) {
		if (entry === ".git") {
			continue;
		}
		yield* fs.remove(path.join(out, entry), { recursive: true });
	}

	for (const app of apps) {
		const target = path.join(out, "examples", app);
		yield* copyTree(path.join(root, "examples", app), target);

		const sharedNames = new Map<string, string>();
		for (const shared of sharedPackages) {
			const sharedTarget = path.join(target, "shared", shared);
			yield* copyTree(
				path.join(root, "examples", ".shared", shared),
				sharedTarget,
			);
			// npm installs a linked package's devDependencies, which would put a
			// second React next to the app's.
			const pkg = yield* readJson(path.join(sharedTarget, "package.json"));
			delete pkg.devDependencies;
			delete pkg.scripts;
			yield* writeJson(path.join(sharedTarget, "package.json"), pkg);
			sharedNames.set(pkg.name, `file:./shared/${shared}`);
		}

		const pkg = yield* readJson(path.join(target, "package.json"));
		for (const deps of [pkg.dependencies, pkg.devDependencies]) {
			if (deps === undefined) {
				continue;
			}
			for (const [name, version] of Object.entries(deps)) {
				if (!version.startsWith("workspace:")) {
					continue;
				}
				const replacement = sharedNames.get(name) ?? published.get(name);
				if (replacement === undefined) {
					return yield* Effect.die(
						`${app}: no standalone version for ${name}@${version}`,
					);
				}
				deps[name] = replacement;
			}
		}
		// The workspace overrides `vite` with Vite+, whose `vp` CLI is native and
		// doesn't run in WebContainers. Standalone, plain Vite is the same bundler.
		if (pkg.devDependencies?.["vite-plus"] !== undefined) {
			delete pkg.devDependencies["vite-plus"];
			for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
				pkg.scripts![name] = script.replace(/^vp /, "vite ");
			}
		}
		// Turbopack has no WebAssembly build, so WebContainers can't run it.
		if (pkg.scripts?.["dev"]?.startsWith("next dev") === true) {
			pkg.scripts["dev"] = pkg.scripts["dev"].replace(
				/^next dev/,
				"next dev --webpack",
			);
		}
		yield* writeJson(path.join(target, "package.json"), pkg);

		const componentsJson = path.join(target, "components.json");
		const components = yield* fs.readFileString(componentsJson);
		yield* fs.writeFileString(
			componentsJson,
			components.replaceAll("../.shared/", "./shared/"),
		);

		// StackBlitz's own installer loads some packages twice, under two paths,
		// so each copy has its own AsyncLocalStorage and the framework's request
		// context goes missing. npm installs one copy.
		yield* writeJson(path.join(target, ".stackblitzrc"), {
			env: { NEXT_TELEMETRY_DISABLED: "1" },
			installDependencies: false,
			startCommand: "npm install && npm run dev",
		});
		yield* fs.writeFileString(
			path.join(target, ".gitignore"),
			`${gitignore.join("\n")}\n`,
		);

		const readme = yield* fs.readFileString(path.join(target, "README.md"));
		const [title, ...rest] = readme.split("\n");
		const body = rest.join("\n").split("\n## Run it\n")[0];
		if (body === undefined || body.length === rest.join("\n").length) {
			return yield* Effect.die(`${app}: README.md has no "## Run it" section`);
		}
		yield* fs.writeFileString(
			path.join(target, "README.md"),
			[
				title,
				"",
				`> A standalone copy of [\`examples/${app}\`](https://github.com/${repo}/tree/main/examples/${app}), generated for StackBlitz on every push to \`main\`: edit the original, not this copy. The shared UI components and fake database are in \`shared/\`.`,
				body.trimEnd(),
				"",
				"## Run it",
				"",
				"```shell",
				"npm install",
				"npm run dev",
				"```",
				"",
			].join("\n"),
		);
		yield* Console.log(`wrote ${path.relative(process.cwd(), target)}`);
	}

	yield* fs.writeFileString(
		path.join(out, "README.md"),
		[
			"# raf-query examples for StackBlitz",
			"",
			`Generated from [\`examples/\`](https://github.com/${repo}/tree/main/examples) on \`main\` by [\`scripts/stackblitz-examples.ts\`](https://github.com/${repo}/blob/main/scripts/stackblitz-examples.ts). Don't edit this branch: every push to \`main\` overwrites it.`,
			"",
			...apps.map(
				(app) =>
					`- [\`examples/${app}\`](./examples/${app}): [open in StackBlitz](https://stackblitz.com/github/${repo}/tree/stackblitz/examples/${app})`,
			),
			"",
		].join("\n"),
	);
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
