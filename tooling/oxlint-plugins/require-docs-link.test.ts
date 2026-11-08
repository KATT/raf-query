import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const root = mkdtempSync(path.join(tmpdir(), "require-docs-link-"));
const files: Record<string, string> = {
	"www/content/reading-queries.md": [
		"# Reading queries",
		"",
		"## The `use()` hook",
		"",
		"```md",
		"## Not a heading",
		"```",
	].join("\n"),
	"src/linked.ts": [
		"/**",
		" * Read a query.",
		" *",
		" * @see https://example.dev/docs/reading-queries#the-use-hook",
		" */",
		"export function useQuery(): void;",
		"export function useQuery(input: number): void;",
		"export function useQuery() {}",
		"",
		"/** @see https://example.dev/docs/reading-queries */",
		"export type QueryState = { isPending: boolean };",
		"",
		"/** @see https://example.dev/docs/reading-queries */",
		"const local = 1;",
		"export { local as renamed };",
	].join("\n"),
	"src/unlinked.ts": [
		"/** Read a query. */",
		"export function bare() {}",
		"",
		"export const noJsdoc = 1;",
		"",
		"/** @see https://example.dev/docs/missing-page */",
		"export const badPage = 1;",
		"",
		"/** @see https://example.dev/docs/reading-queries#nope */",
		"export const badAnchor = 1;",
		"",
		"/** Mentions https://example.dev/docs/reading-queries without a tag. */",
		"export const noSee = 1;",
	].join("\n"),
	"src/barrel.ts": [
		'export { useQuery } from "./linked.ts";',
		'export * from "./linked.ts";',
	].join("\n"),
	"src/imports.ts": [
		'import { useQuery } from "./linked.ts";',
		'import { bare } from "./unlinked.ts";',
		"export { useQuery, bare };",
	].join("\n"),
};
for (const [file, content] of Object.entries(files)) {
	mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
	writeFileSync(path.join(root, file), content);
}

const tester = new RuleTester({ cwd: root });
const entry = path.join(root, "src/index.ts");
const options: [{ baseUrl: string; contentDir: string }] = [
	{ baseUrl: "https://example.dev/docs/", contentDir: "www/content" },
];

tester.run("require-docs-link", plugin.rules["require-docs-link"], {
	valid: [
		{
			code: 'export { useQuery, type QueryState, renamed } from "./linked.ts";',
			filename: entry,
			options,
		},
		{ code: 'export * from "./barrel.ts";', filename: entry, options },
		{ code: 'export * from "@raf-query/core";', filename: entry, options },
		{
			code: 'export { useQuery as read } from "./imports.ts";',
			filename: entry,
			options,
		},
		{
			code: [
				"/** @see https://example.dev/docs/reading-queries#the-use-hook */",
				"export function setup(): void;",
				"export function setup() {}",
			].join("\n"),
			filename: entry,
			options,
		},
		{
			code: [
				"/** @see https://example.dev/docs/reading-queries */",
				"function local() {}",
				"export { local };",
			].join("\n"),
			filename: entry,
			options,
		},
	],
	invalid: [
		{
			code: 'export { bare, noJsdoc, noSee } from "./unlinked.ts";',
			filename: entry,
			options,
			errors: [
				{ messageId: "missing" },
				{ messageId: "missing" },
				{ messageId: "missing" },
			],
		},
		{
			code: 'export { badPage } from "./unlinked.ts";',
			filename: entry,
			options,
			errors: [{ messageId: "page" }],
		},
		{
			code: 'export { badAnchor } from "./unlinked.ts";',
			filename: entry,
			options,
			errors: [{ messageId: "anchor" }],
		},
		{
			code: 'export * from "./unlinked.ts";',
			filename: entry,
			options,
			errors: [
				{ messageId: "missing" },
				{ messageId: "missing" },
				{ messageId: "page" },
				{ messageId: "anchor" },
				{ messageId: "missing" },
			],
		},
		{
			code: 'export { bare } from "./imports.ts";',
			filename: entry,
			options,
			errors: [{ messageId: "missing" }],
		},
		{
			code: 'export { nothing } from "./linked.ts";',
			filename: entry,
			options,
			errors: [{ messageId: "unresolved" }],
		},
		{
			code: "/** Set up. */\nexport function setup() {}",
			filename: entry,
			options,
			errors: [{ messageId: "missing" }],
		},
	],
});
