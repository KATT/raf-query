/**
 * Standalone copies of the example apps, for StackBlitz to open one folder
 * at a time. Each copy is its own pnpm workspace: the app in `apps/<app>`, and
 * `examples/.shared/*` copied as-is into `packages/`, so `@examples/*` stay
 * `workspace:*`. Only `@raf-query/*` changes, to the published version.
 */
import { Effect, FileSystem, Path } from "effect";

export const repo = "KATT/raf-query";
export const branch = "stackblitz";
export const apps: ReadonlyArray<string> = ["nextjs", "tanstack-start"];

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

export interface PackageJson {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	name: string;
	private?: boolean;
	scripts?: Record<string, string>;
	type?: string;
	version: string;
}

export function isIgnored(file: string, separator: string) {
	return file
		.split(separator)
		.some((part) => ignored.has(part) || part.endsWith(".tsbuildinfo"));
}

/**
 * The app's `package.json` outside the monorepo. `published` maps the
 * `@raf-query/*` packages to their npm version; other `workspace:`
 * dependencies must be in `packages/`.
 */
export function standalonePackageJson(
	pkg: PackageJson,
	published: ReadonlyMap<string, string>,
	workspace: ReadonlySet<string>,
): PackageJson {
	const replace = (deps: Record<string, string> | undefined) => {
		if (deps === undefined) {
			return undefined;
		}
		const entries = Object.entries(deps).map(([name, version]) => {
			if (!version.startsWith("workspace:") || workspace.has(name)) {
				return [name, version];
			}
			const replacement = published.get(name);
			if (replacement === undefined) {
				throw new Error(`no standalone version for ${name}@${version}`);
			}
			return [name, replacement];
		});
		return Object.fromEntries(entries);
	};
	const scripts = Object.fromEntries(
		Object.entries(pkg.scripts ?? {}).map(([name, script]) => [
			name,
			// The `vp` CLI is native, and Turbopack has no WebAssembly build:
			// neither runs in WebContainers. Standalone, `vite` is plain Vite
			// (the monorepo overrides it with Vite+).
			script
				.replace(/^vp /, "vite ")
				.replace(/^next dev/, "next dev --webpack"),
		]),
	);
	const devDependencies = replace(pkg.devDependencies);
	if (devDependencies !== undefined) {
		delete devDependencies["vite-plus"];
	}
	return {
		...pkg,
		dependencies: replace(pkg.dependencies),
		devDependencies,
		scripts,
	};
}

/** The workspace root's `package.json`: runs the app's scripts from the root. */
export function rootPackageJson(app: string, pkg: PackageJson): PackageJson {
	const scripts = Object.fromEntries(
		Object.keys(pkg.scripts ?? {}).map((name) => [
			name,
			name === "typecheck"
				? "pnpm --recursive typecheck"
				: `pnpm --filter ${pkg.name} ${name}`,
		]),
	);
	return {
		name: `raf-query-${app}-example`,
		private: true,
		scripts,
		type: "module",
		version: "0.0.0",
	};
}

/**
 * The app's README with a note that it's a generated copy, and `## Run it`
 * replaced with the standalone commands. `undefined` if it has no `## Run it`.
 */
export function standaloneReadme(app: string, readme: string) {
	const [title, ...rest] = readme.split("\n");
	const [body, runIt] = rest.join("\n").split("\n## Run it\n");
	if (title === undefined || body === undefined || runIt === undefined) {
		return undefined;
	}
	return [
		title,
		"",
		`> A standalone copy of [\`examples/${app}\`](https://github.com/${repo}/tree/main/examples/${app}), generated for StackBlitz on every release: edit the original, not this copy. The app is in \`apps/${app}\`; the UI components and fake database it shares with the other examples are in \`packages/\`.`,
		body.trimEnd(),
		"",
		"## Run it",
		"",
		"```shell",
		"pnpm install",
		"pnpm dev",
		"```",
		"",
	].join("\n");
}

export const workspaceYaml = "packages:\n  - apps/*\n  - packages/*\n";

export const gitignore = [
	"node_modules",
	".next",
	".output",
	".tanstack",
	"dist",
	"next-env.d.ts",
	"*.tsbuildinfo",
	"",
].join("\n");

export const stackblitzrc = {
	env: {
		NEXT_TELEMETRY_DISABLED: "1",
		NODE_OPTIONS: "--import=./webcontainer-async-context.mjs",
	},
	// StackBlitz's own installer doesn't read pnpm workspaces.
	installDependencies: false,
	startCommand: "pnpm install && pnpm dev",
};

export const branchReadme = [
	"# raf-query examples for StackBlitz",
	"",
	`Generated from [\`examples/\`](https://github.com/${repo}/tree/main/examples) by [\`tooling/stackblitz\`](https://github.com/${repo}/tree/main/tooling/stackblitz) after every release. Don't edit this branch: the next release overwrites it.`,
	"",
	...apps.map(
		(app) =>
			`- [\`examples/${app}\`](./examples/${app}): [open in StackBlitz](https://stackblitz.com/github/${repo}/tree/${branch}/examples/${app})`,
	),
	"",
].join("\n");

const json = (value: PackageJson | typeof stackblitzrc) =>
	`${JSON.stringify(value, null, "\t")}\n`;

const readJson = Effect.fn("readJson")(function* (file: string) {
	const fs = yield* FileSystem.FileSystem;
	const text = yield* fs.readFileString(file);
	return yield* Effect.try({
		catch: (error) => new Error(`${file}: ${String(error)}`),
		try: (): PackageJson => JSON.parse(text),
	});
});

/** The `@raf-query/*` packages the copies install from npm, and their version. */
export const publishedVersions = Effect.fn("publishedVersions")(function* (
	root: string,
) {
	const path = yield* Path.Path;
	const published = new Map<string, string>();
	for (const name of ["core", "react"]) {
		const pkg = yield* readJson(
			path.join(root, "packages", name, "package.json"),
		);
		published.set(pkg.name, pkg.version);
	}
	return published;
});

/**
 * Replaces everything in `out` except `.git` with a workspace for each app, in
 * `out/examples/<app>`. Returns the workspaces' directories.
 */
export const writeCopies = Effect.fn("writeCopies")(function* (
	root: string,
	out: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;

	const copyTree = Effect.fn("copyTree")(function* (from: string, to: string) {
		for (const entry of yield* fs.readDirectory(from, { recursive: true })) {
			if (isIgnored(entry, path.sep)) {
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

	const published = yield* publishedVersions(root);
	const sharedDirs = yield* fs.readDirectory(
		path.join(root, "examples", ".shared"),
	);
	const workspacePackages = new Set<string>();
	for (const dir of sharedDirs) {
		const pkg = yield* readJson(
			path.join(root, "examples", ".shared", dir, "package.json"),
		);
		workspacePackages.add(pkg.name);
	}

	yield* fs.makeDirectory(out, { recursive: true });
	for (const entry of yield* fs.readDirectory(out)) {
		if (entry !== ".git") {
			yield* fs.remove(path.join(out, entry), { recursive: true });
		}
	}

	const targets: Array<string> = [];
	for (const app of apps) {
		const target = path.join(out, "examples", app);
		const appDir = path.join(target, "apps", app);
		targets.push(target);
		yield* copyTree(path.join(root, "examples", app), appDir);
		for (const dir of sharedDirs) {
			yield* copyTree(
				path.join(root, "examples", ".shared", dir),
				path.join(target, "packages", dir),
			);
		}

		const pkg = yield* readJson(path.join(appDir, "package.json"));
		const standalone = yield* Effect.try({
			catch: (error) => new Error(`${app}: ${String(error)}`),
			try: () => standalonePackageJson(pkg, published, workspacePackages),
		});
		yield* fs.writeFileString(
			path.join(appDir, "package.json"),
			json(standalone),
		);
		yield* fs.writeFileString(
			path.join(target, "package.json"),
			json(rootPackageJson(app, standalone)),
		);

		const readme = yield* fs.readFileString(path.join(appDir, "README.md"));
		const standaloneReadmeText = standaloneReadme(app, readme);
		if (standaloneReadmeText === undefined) {
			return yield* Effect.fail(
				new Error(`${app}: README.md has no "## Run it" section`),
			);
		}
		yield* fs.remove(path.join(appDir, "README.md"));
		yield* fs.writeFileString(
			path.join(target, "README.md"),
			standaloneReadmeText,
		);

		const componentsJson = path.join(appDir, "components.json");
		const components = yield* fs.readFileString(componentsJson);
		yield* fs.writeFileString(
			componentsJson,
			components.replaceAll("../.shared/", "../../packages/"),
		);

		yield* fs.writeFileString(
			path.join(target, "pnpm-workspace.yaml"),
			workspaceYaml,
		);
		yield* fs.writeFileString(path.join(target, ".gitignore"), gitignore);
		yield* fs.writeFileString(
			path.join(target, ".stackblitzrc"),
			json(stackblitzrc),
		);
		yield* fs.copyFile(
			path.join(import.meta.dirname, "webcontainer-async-context.mjs"),
			path.join(target, "webcontainer-async-context.mjs"),
		);
	}

	yield* fs.writeFileString(path.join(out, "README.md"), branchReadme);
	return targets;
});
