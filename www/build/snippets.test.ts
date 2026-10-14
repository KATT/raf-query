import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "@effect/vitest";

import { expandSnippets } from "./snippets.ts";

function setup(files: Record<string, string>) {
	const root = mkdtempSync(path.join(tmpdir(), "snippets-"));
	for (const [name, contents] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
		writeFileSync(path.join(root, name), contents);
	}
	return {
		expand: (markdown: string) =>
			expandSnippets(markdown, { file: path.join(root, "page.md"), root }),
		root,
	};
}

const todos = [
	'import { todosQuery } from "../queries.ts";',
	"",
	"// #region loader",
	"export const Route = 1;",
	"// ^?",
	"// #endregion",
	"",
	"export function Page() {",
	"\t// #region body",
	"\treturn Route;",
	"\t// #endregion body",
	"}",
	"",
].join("\n");

describe("expandSnippets", () => {
	it("shows the region and compiles the rest of the file next to it", () => {
		const page = setup({ "page/src/routes/todos.tsx": todos });
		const expanded = page.expand(
			"Intro\n\n<<< ./page/src/routes/todos.tsx#loader\n\nOutro\n",
		);
		expect(expanded.files).toEqual([
			path.join(page.root, "page/src/routes/todos.tsx"),
		]);
		expect(expanded.markdown).toBe(
			[
				"Intro",
				"",
				'```tsx twoslash title="src/routes/todos.tsx"',
				"// ---cut-start---",
				"// @filename: page/src/routes/todos.loader.twoslash.tsx",
				'import { todosQuery } from "../queries.ts";',
				"",
				"// ---cut-end---",
				"export const Route = 1;",
				"// ^?",
				"// ---cut-start---",
				"",
				"export function Page() {",
				"\treturn Route;",
				"}",
				"// ---cut-end---",
				"```",
				"",
				"Outro",
				"",
			].join("\n"),
		);
	});

	it("dedents a region and drops other regions' queries", () => {
		const page = setup({ "page/src/routes/todos.tsx": todos });
		expect(
			page.expand("<<< ./page/src/routes/todos.tsx#body []").markdown,
		).toBe(
			[
				"```tsx twoslash",
				"// ---cut-start---",
				"// @filename: page/src/routes/todos.body.twoslash.tsx",
				'import { todosQuery } from "../queries.ts";',
				"",
				"export const Route = 1;",
				"",
				"export function Page() {",
				"// ---cut-end---",
				"return Route;",
				"// ---cut-start---",
				"}",
				"// ---cut-end---",
				"```",
			].join("\n"),
		);
	});

	it("includes a whole file, with a custom title", () => {
		const page = setup({ "shared/client.ts": "export const a = 1;\n" });
		expect(page.expand("<<< ./shared/client.ts [src/client.ts]").markdown).toBe(
			[
				'```ts twoslash title="src/client.ts"',
				"// ---cut-start---",
				"// @filename: shared/client.file.twoslash.ts",
				"// ---cut-end---",
				"export const a = 1;",
				"```",
			].join("\n"),
		);
	});

	it("shows every part of a region that appears more than once", () => {
		const page = setup({
			"page/a.ts": [
				"// #region use",
				'import { a } from "./b.ts";',
				"// #endregion",
				'import { c } from "./c.ts";',
				"",
				"// #region use",
				"a(c);",
				"// #endregion use",
			].join("\n"),
		});
		expect(page.expand("<<< ./page/a.ts#use").markdown).toBe(
			[
				'```ts twoslash title="a.ts"',
				"// ---cut-start---",
				"// @filename: page/a.use.twoslash.ts",
				"// ---cut-end---",
				'import { a } from "./b.ts";',
				"// ---cut-start---",
				'import { c } from "./c.ts";',
				"",
				"// ---cut-end---",
				"a(c);",
				"```",
			].join("\n"),
		);
	});

	it("fails on a missing or unclosed region", () => {
		const page = setup({
			"page/a.ts": "// #region open\nexport const a = 1;\n",
		});
		expect(() => page.expand("<<< ./page/a.ts#missing")).toThrow(
			'no "// #region missing"',
		);
		expect(() => page.expand("<<< ./page/a.ts#open")).toThrow("isn't closed");
	});
});
