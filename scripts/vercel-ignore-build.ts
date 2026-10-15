#!/usr/bin/env node
/**
 * Vercel "Ignored Build Step" for every project's `vercel.json`: exit 0 skips
 * the deployment, exit 1 builds it. cwd is the project's root directory. Runs
 * before install, so Node built-ins only.
 *
 * Builds when any of these changed since the project's last deployment on the
 * branch: the project, a workspace package it depends on (transitively), or
 * the root install inputs. A branch's first deployment has no last deployment,
 * so it compares with where the branch left main. Any failure builds.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const INSTALL_INPUTS = [
	"package.json",
	"pnpm-lock.yaml",
	"pnpm-workspace.yaml",
	".npmrc",
	"patches",
];
const DEPENDENCY_FIELDS = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
] as const;

type Manifest = { name?: string } & Partial<
	Record<(typeof DEPENDENCY_FIELDS)[number], Record<string, string>>
>;

const git = (...args: Array<string>) =>
	execFileSync("git", args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	}).trim();

const readManifest = (dir: string): Manifest =>
	JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));

/** Expands the `packages` globs of `pnpm-workspace.yaml` (`*` segments only). */
function workspaceDirs(root: string): Array<string> {
	const yaml = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
	const block = /^packages:\n((?:[ \t]+-.*\n?)+)/m.exec(yaml)?.[1] ?? "";
	const globs = [...block.matchAll(/-\s*["']?([^"'\n]+?)["']?\s*$/gm)].map(
		(m) => m[1],
	);

	return globs.flatMap((glob) =>
		glob
			.split("/")
			.reduce<Array<string>>(
				(dirs, segment) =>
					dirs.flatMap((dir) =>
						segment === "*"
							? readdirSync(path.join(root, dir), { withFileTypes: true })
									.filter(
										(entry) =>
											entry.isDirectory() && !entry.name.startsWith("."),
									)
									.map((entry) => path.join(dir, entry.name))
							: [path.join(dir, segment)],
					),
				[""],
			)
			.filter((dir) => existsSync(path.join(root, dir, "package.json"))),
	);
}

/** The project's directory and those of the workspace packages it depends on. */
function projectDirs(root: string, project: string): Array<string> {
	const byName = new Map(
		workspaceDirs(root).map((dir) => [
			readManifest(path.join(root, dir)).name,
			dir,
		]),
	);
	const dirs = new Set<string>();
	const visit = (dir: string) => {
		if (dirs.has(dir)) {
			return;
		}
		dirs.add(dir);
		const manifest = readManifest(path.join(root, dir));
		for (const field of DEPENDENCY_FIELDS) {
			for (const [name, version] of Object.entries(manifest[field] ?? {})) {
				const dep = byName.get(name);
				if (dep !== undefined && version.startsWith("workspace:")) {
					visit(dep);
				}
			}
		}
	};
	visit(project);
	return [...dirs];
}

function baseCommit(): string | undefined {
	const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
	if (previous) {
		return previous;
	}
	if (process.env.VERCEL_GIT_COMMIT_REF === "main") {
		return undefined;
	}
	git(
		"fetch",
		"--quiet",
		"--no-tags",
		"--depth=100",
		"https://github.com/KATT/raf-query.git",
		"main",
	);
	return git("merge-base", "FETCH_HEAD", "HEAD");
}

try {
	const root = git("rev-parse", "--show-toplevel");
	const project = path.relative(root, process.cwd());
	const watched = [...projectDirs(root, project), ...INSTALL_INPUTS];
	const base = baseCommit();
	if (base === undefined) {
		console.log("No earlier deployment to compare with: building.");
		process.exit(1);
	}

	const changed = git(
		"-C",
		root,
		"diff",
		"--name-only",
		base,
		"HEAD",
		"--",
		...watched,
	);
	console.log(`Watching since ${base.slice(0, 12)}: ${watched.join(", ")}`);
	if (changed === "") {
		console.log("Nothing changed: skipping.");
		process.exit(0);
	}
	console.log(`Changed:\n${changed}\nBuilding.`);
	process.exit(1);
} catch (error) {
	console.log(`Ignore step failed, building: ${String(error)}`);
	process.exit(1);
}
