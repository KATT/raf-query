import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import { renderMarkdown, searchSectionsOf } from "./markdown.ts";

/** A samples dir whose `tanstack-start` app compiles inline blocks, removed when the test ends. */
const samples = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = yield* fs.makeTempDirectoryScoped({ prefix: "markdown-" });
	const app = path.join(root, "tanstack-start");
	yield* fs.makeDirectory(path.join(app, "src"), { recursive: true });
	yield* fs.writeFileString(path.join(app, "src/app.ts"), "export {};");
	yield* fs.writeFileString(
		path.join(app, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: { lib: ["es5"], strict: true, types: [] },
			include: ["src"],
		}),
	);
	return root;
});

describe("renderMarkdown", () => {
	it.effect("lists each block's type queries in page order", () =>
		Effect.gen(function* () {
			const samplesDir = yield* samples;
			// As in a build, an earlier page has made Shiki load `ts` already.
			yield* renderMarkdown("```ts\nconst a = 1;\n```", { samplesDir });
			const markdown = [
				"```tsx twoslash",
				"const first = 1;",
				"//    ^?",
				"```",
				"",
				"```json",
				'{ "a": 1 }',
				"```",
				"",
				"```ts twoslash",
				'const second = "b";',
				"//    ^?",
				"```",
			].join("\n");
			const rendered = yield* renderMarkdown(markdown, { samplesDir });
			expect(rendered.typeQueries).toEqual([
				["const first: 1"],
				['const second: "b"'],
			]);
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});

describe("searchSectionsOf", () => {
	it.effect("splits a page's text at its headings, without code", () =>
		Effect.gen(function* () {
			const markdown = [
				"Intro with `inline` code and a [link](./caching.md).",
				"",
				"> [!NOTE]",
				"> Read this first.",
				"",
				"## Retry delay",
				"",
				"| Option | Default |",
				"| ------ | ------- |",
				"| `retry` | 3 |",
				"",
				"```ts twoslash",
				"const hidden = 1;",
				"```",
				"",
				"```demo",
				"retries",
				"```",
				"",
				"### Retry delay",
				"",
				"- one",
				"- two",
			].join("\n");
			const outline = yield* searchSectionsOf(markdown);
			expect(outline.headings).toEqual([
				{ depth: 2, id: "retry-delay", text: "Retry delay" },
				{ depth: 3, id: "retry-delay-1", text: "Retry delay" },
			]);
			expect(outline.sections).toEqual([
				{
					id: undefined,
					text: "Intro with inline code and a link. Read this first.",
				},
				{ id: "retry-delay", text: "Option Default retry 3" },
				{ id: "retry-delay-1", text: "one two" },
			]);
		}),
	);
});
