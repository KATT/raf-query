#!/usr/bin/env node
/**
 * Bundle typical import sets of raf-query and the TanStack Query equivalent
 * with Rolldown (minified, browser, production), and print a Markdown table of
 * minified / gzip / brotli sizes. React is external, as in an app that ships
 * it anyway. The "Effect" column is what bundling `effect` adds over leaving
 * it external.
 *
 * Bundles the packages' `src/` by default; `--dist` uses the built `dist/`
 * (run `pnpm build` first), which is what npm users get.
 *
 * Usage: node scripts/bundle-size.ts [--dist] [--json]
 */
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path } from "effect";
import { rolldown } from "rolldown";

interface Case {
	readonly name: string;
	readonly raf: string;
	readonly tanstack: string;
}

const cases: ReadonlyArray<Case> = [
	{
		name: "Query options only",
		raf: `export { queryOptions } from "@raf-query/react";`,
		tanstack: `export { queryOptions } from "@tanstack/react-query";`,
	},
	{
		name: "Core: client only",
		raf: `export { QueryClient } from "@raf-query/core";`,
		tanstack: `export { QueryClient } from "@tanstack/query-core";`,
	},
	{
		name: "React: client, provider, useQuery",
		raf: `export { QueryClient, QueryClientProvider, queryOptions, useQuery } from "@raf-query/react";`,
		tanstack: `export { QueryClient, QueryClientProvider, queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";`,
	},
	{
		name: "React + paged queries",
		raf: `export { QueryClient, QueryClientProvider, infiniteQueryOptions, queryOptions, useQuery } from "@raf-query/react";`,
		tanstack: `export { QueryClient, QueryClientProvider, infiniteQueryOptions, queryOptions, useQuery, useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";`,
	},
	{
		name: "React + hydration",
		raf: `export { QueryClient, QueryClientProvider, dehydrate, hydrate, queryOptions, useQuery } from "@raf-query/react";`,
		tanstack: `export { QueryClient, QueryClientProvider, HydrationBoundary, dehydrate, hydrate, queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";`,
	},
	{
		name: "React + Effect `queryFn`s",
		raf: `export { QueryClient, QueryClientProvider, useQuery } from "@raf-query/react"; export { effectQueryOptions } from "@raf-query/react/effect";`,
		tanstack: `export { QueryClient, QueryClientProvider, queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";`,
	},
	{
		name: "Everything (`export *`)",
		raf: `export * from "@raf-query/react"; export * from "@raf-query/react/effect";`,
		tanstack: `export * from "@tanstack/react-query";`,
	},
];

interface Size {
	readonly brotli: number;
	readonly gzip: number;
	readonly min: number;
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(2)} kB`;
const ratio = (a: number, b: number) => `${(a / b).toFixed(1)}×`;

const external = [/^react($|\/)/, /^react-dom($|\/)/];

Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = path.join(import.meta.dirname, "..");
	const dir = path.join(root, "node_modules/.cache/bundle-size");
	const reactQuery = yield* fs.realPath(
		path.join(root, "node_modules/@tanstack/react-query"),
	);
	const dist = process.argv.includes("--dist");
	const source = (pkg: string, module: string) =>
		path.join(
			root,
			"packages",
			pkg,
			dist ? `dist/${module}.mjs` : `src/${module}.ts`,
		);
	const alias = {
		"@raf-query/core": source("core", "index"),
		"@raf-query/core/effect": source("core", "effect"),
		"@raf-query/react": source("react", "index"),
		"@raf-query/react/effect": source("react", "effect"),
		// pnpm only links query-core next to react-query, not at the root.
		"@tanstack/query-core": path.join(
			reactQuery,
			"../query-core/build/modern/index.js",
		),
	};
	yield* fs.makeDirectory(dir, { recursive: true });

	const measure = Effect.fn("measure")(function* (
		name: string,
		code: string,
		bundleEffect: boolean,
	) {
		const input = path.join(dir, `${name}.ts`);
		yield* fs.writeFileString(input, code);
		const output = yield* Effect.promise(async () => {
			const bundle = await rolldown({
				cwd: root,
				external: bundleEffect ? external : [...external, /^effect($|\/)/],
				input,
				logLevel: "silent",
				platform: "browser",
				resolve: { alias },
				transform: {
					define: { "process.env.NODE_ENV": JSON.stringify("production") },
				},
			});
			const generated = await bundle.generate({ format: "esm", minify: true });
			await bundle.close();
			return generated.output[0].code;
		});
		const buffer = Buffer.from(output);
		const size: Size = {
			brotli: brotliCompressSync(buffer, {
				params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
			}).length,
			gzip: gzipSync(buffer, { level: 9 }).length,
			min: buffer.length,
		};
		return size;
	});

	const rows = [];
	for (const [index, entry] of cases.entries()) {
		const raf = yield* measure(`raf-${index}`, entry.raf, true);
		const rafNoEffect = yield* measure(`raf-${index}-ext`, entry.raf, false);
		const tanstack = yield* measure(`tanstack-${index}`, entry.tanstack, true);
		rows.push({ name: entry.name, raf, rafNoEffect, tanstack });
	}

	if (process.argv.includes("--json")) {
		yield* Console.log(JSON.stringify(rows, null, "\t"));
		return;
	}

	yield* Console.log(
		"| Import set | TanStack (gzip) | raf-query (gzip) | raf-query without Effect (gzip) | Effect's share | raf / TanStack |",
	);
	yield* Console.log("| --- | --: | --: | --: | --: | --: |");
	for (const row of rows) {
		yield* Console.log(
			`| ${row.name} | ${kb(row.tanstack.gzip)} | ${kb(row.raf.gzip)} | ${kb(row.rafNoEffect.gzip)} | ${kb(row.raf.gzip - row.rafNoEffect.gzip)} | ${ratio(row.raf.gzip, row.tanstack.gzip)} |`,
		);
	}
	yield* Console.log("");
	yield* Console.log(
		"| Import set | TanStack min / brotli | raf-query min / brotli |",
	);
	yield* Console.log("| --- | --: | --: |");
	for (const row of rows) {
		yield* Console.log(
			`| ${row.name} | ${kb(row.tanstack.min)} / ${kb(row.tanstack.brotli)} | ${kb(row.raf.min)} / ${kb(row.raf.brotli)} |`,
		);
	}
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
