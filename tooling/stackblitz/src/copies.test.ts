import { NodeServices } from "@effect/platform-node";
import { assert, describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import {
	apps,
	isIgnored,
	rootPackageJson,
	standalonePackageJson,
	standaloneReadme,
	writeCopies,
} from "./copies.ts";

const root = new URL("../../..", import.meta.url).pathname;

describe("isIgnored", () => {
	it("skips build output, dependencies and TypeScript build info", () => {
		assert.isTrue(isIgnored("node_modules/react/index.js", "/"));
		assert.isTrue(isIgnored("src/.next/cache", "/"));
		assert.isTrue(isIgnored("tsconfig.tsbuildinfo", "/"));
		assert.isFalse(isIgnored("src/app/page.tsx", "/"));
		assert.isFalse(isIgnored("src/dist-utils.ts", "/"));
	});
});

describe("standalonePackageJson", () => {
	const published = new Map([["@raf-query/react", "1.2.0"]]);
	const shared = new Set(["@examples/ui"]);

	it("keeps shared packages in the workspace and installs raf-query from npm", () => {
		const pkg = standalonePackageJson(
			{
				dependencies: {
					"@examples/ui": "workspace:*",
					"@raf-query/react": "workspace:*",
					react: "19.3.0",
				},
				devDependencies: { typescript: "7.0.2", "vite-plus": "1.0.0" },
				name: "@examples/app",
				scripts: {
					build: "next build",
					dev: "next dev --port 3001",
					start: "vp preview",
				},
				version: "0.0.0",
			},
			published,
			shared,
		);
		expect(pkg).toEqual({
			dependencies: {
				"@examples/ui": "workspace:*",
				"@raf-query/react": "1.2.0",
				react: "19.3.0",
			},
			devDependencies: { typescript: "7.0.2" },
			name: "@examples/app",
			scripts: {
				build: "next build",
				dev: "next dev --webpack --port 3001",
				start: "vite preview",
			},
			version: "0.0.0",
		});
	});

	it("throws on a workspace package that isn't shared or published", () => {
		assert.throws(
			() =>
				standalonePackageJson(
					{
						dependencies: { "@raf-query/unreleased": "workspace:*" },
						name: "@examples/app",
						version: "0.0.0",
					},
					published,
					shared,
				),
			/@raf-query\/unreleased/,
		);
	});
});

describe("rootPackageJson", () => {
	it("runs the app's scripts from the workspace root", () => {
		expect(
			rootPackageJson("nextjs", {
				name: "@examples/nextjs",
				scripts: { build: "next build", dev: "next dev", typecheck: "tsc" },
				version: "0.0.0",
			}),
		).toEqual({
			name: "raf-query-nextjs-example",
			private: true,
			scripts: {
				build: "pnpm --filter @examples/nextjs build",
				dev: "pnpm --filter @examples/nextjs dev",
				typecheck: "pnpm --recursive typecheck",
			},
			type: "module",
			version: "0.0.0",
		});
	});
});

describe("standaloneReadme", () => {
	it("notes the copy's origin and replaces the monorepo commands", () => {
		const readme = standaloneReadme(
			"nextjs",
			"# Example\n\nWhat it shows.\n\n## Run it\n\n```shell\npnpm dev:next\n```\n",
		);
		expect(readme).toContain(
			"# Example\n\n> A standalone copy of [`examples/nextjs`]",
		);
		expect(readme).toContain(
			"What it shows.\n\n## Run it\n\n```shell\npnpm install\npnpm dev\n```\n",
		);
		expect(readme).not.toContain("dev:next");
	});

	it("returns undefined without a `## Run it` section", () => {
		assert.isUndefined(
			standaloneReadme("nextjs", "# Example\n\nNo commands.\n"),
		);
	});
});

describe("writeCopies", () => {
	it.effect("writes each app as its own pnpm workspace", () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const out = yield* fs.makeTempDirectoryScoped();
			yield* fs.makeDirectory(path.join(out, ".git"));
			yield* fs.writeFileString(path.join(out, ".git", "HEAD"), "kept");
			yield* fs.writeFileString(path.join(out, "stale.txt"), "removed");

			const targets = yield* writeCopies(root, out);

			assert.deepStrictEqual(
				targets,
				apps.map((app) => path.join(out, "examples", app)),
			);
			assert.strictEqual(
				yield* fs.readFileString(path.join(out, ".git", "HEAD")),
				"kept",
			);
			assert.isFalse(yield* fs.exists(path.join(out, "stale.txt")));
			expect(yield* fs.readFileString(path.join(out, "README.md"))).toContain(
				"/tree/stackblitz/examples/nextjs",
			);

			const react = JSON.parse(
				yield* fs.readFileString(
					path.join(root, "packages", "react", "package.json"),
				),
			);
			for (const [index, target] of targets.entries()) {
				const app = apps[index];
				const read = (file: string) =>
					fs.readFileString(path.join(target, file));
				const exists = (file: string) => fs.exists(path.join(target, file));

				const pkg = JSON.parse(yield* read(`apps/${app}/package.json`));
				assert.strictEqual(pkg.dependencies["@raf-query/react"], react.version);
				assert.strictEqual(pkg.dependencies["@examples/ui"], "workspace:*");
				assert.strictEqual(pkg.dependencies["@examples/db"], "workspace:*");
				const rootPkg = JSON.parse(yield* read("package.json"));
				assert.strictEqual(
					rootPkg.scripts.dev,
					`pnpm --filter ${pkg.name} dev`,
				);
				assert.strictEqual(
					yield* read("pnpm-workspace.yaml"),
					"packages:\n  - apps/*\n  - packages/*\n",
				);
				assert.strictEqual(
					JSON.parse(yield* read(".stackblitzrc")).startCommand,
					"pnpm install && pnpm dev",
				);
				expect(yield* read("webcontainer-async-context.mjs")).toContain(
					"process.versions.webcontainer",
				);
				expect(yield* read("README.md")).toContain("pnpm install\npnpm dev\n");
				assert.isFalse(yield* exists(`apps/${app}/README.md`));
				expect(yield* read(`apps/${app}/components.json`)).toContain(
					'"../../packages/ui/src/styles/globals.css"',
				);
				assert.isFalse(yield* exists(`apps/${app}/node_modules`));

				for (const dir of ["db", "ui"]) {
					const file = path.join(dir, "package.json");
					assert.strictEqual(
						yield* read(path.join("packages", file)),
						yield* fs.readFileString(
							path.join(root, "examples", ".shared", file),
						),
					);
					assert.isFalse(
						yield* exists(path.join("packages", dir, "node_modules")),
					);
				}
			}
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});
