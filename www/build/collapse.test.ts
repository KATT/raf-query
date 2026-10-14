import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "@effect/vitest";

import { renderMarkdown } from "./markdown.ts";

// `pnpm test` runs in `www/`. Vitest serves this file from a non-file URL.
const contentDir = path.resolve("content");

async function rendered(markdown: string) {
	return renderMarkdown(markdown, { twoslashRoot: contentDir });
}

async function htmlOf(markdown: string) {
	const result = await rendered(markdown);
	return result.segments
		.map((segment) => (segment.kind === "html" ? segment.html : ""))
		.join("");
}

function mount(html: string) {
	const root = document.createElement("div");
	root.innerHTML = html;
	return root;
}

function isElement(node: Node): node is HTMLElement {
	return node.nodeType === Node.ELEMENT_NODE;
}

function fence(body: string, meta = "") {
	return `\`\`\`ts${meta ? ` ${meta}` : ""}\n${body}\n\`\`\``;
}

describe("Expressive Code folds", () => {
	it("folds a range and keeps it in the block", async () => {
		const root = mount(
			await htmlOf(
				fence(
					[
						"function demo() {",
						"\tconst a = 1;",
						"\tconst b = 2;",
						"\treturn a;",
						"}",
					].join("\n"),
					"collapse={2-3}",
				),
			),
		);
		const section = root.querySelector(".ec-section");
		const summary = section?.querySelector("summary");
		const lines = section?.querySelector(".content-lines");
		expect(summary?.textContent).toContain("2 collapsed lines");
		expect(section?.querySelector("details")?.hasAttribute("open")).toBe(false);
		expect(lines?.textContent).toContain("const a = 1;");
		expect(lines?.textContent).toContain("const b = 2;");
		expect(root.textContent).toContain("return a;");
		expect(summary?.querySelector(".ec-line")?.getAttribute("style")).toContain(
			"2ch",
		);
	});

	it("counts a blank line in the folded range", async () => {
		const root = mount(
			await htmlOf(fence("const a = 1;\n\nconst b = 2;", "collapse={2-3}")),
		);
		expect(root.querySelector("summary")?.textContent).toContain(
			"2 collapsed lines",
		);
	});

	it("shows an expected error and fails on one a block doesn't expect", async () => {
		const root = mount(
			await htmlOf(
				[
					"```ts twoslash",
					"// @errors: 2322",
					"const value: string = 1;",
					"```",
				].join("\n"),
			),
		);
		expect(root.querySelector(".twoslash-error-line")?.textContent).toContain(
			"not assignable",
		);
		await expect(
			htmlOf(["```ts twoslash", "const value: string = 1;", "```"].join("\n")),
		).rejects.toThrow(/not assignable/);
	});

	it("leaves a block without a fold unchanged", async () => {
		const root = mount(await htmlOf(fence("const a = 1;")));
		expect(root.querySelector(".ec-section")).toBeNull();
		expect(root.querySelector("pre")?.textContent).toContain("const a = 1;");
	});

	it("keeps a pinned type with the lines it belongs to", async () => {
		const result = await rendered(
			[
				"```ts twoslash collapse={2-2}",
				"const value = 1;",
				"const hidden = value;",
				"//       ^?",
				"const after = hidden;",
				"```",
			].join("\n"),
		);
		const root = mount(
			result.segments
				.map((segment) => (segment.kind === "html" ? segment.html : ""))
				.join(""),
		);
		const query = root.querySelector(".twoslash-query-line");
		expect(query?.closest(".content-lines")).not.toBeNull();
		expect(query?.textContent).toContain("hidden");
		expect(result.typeQueries[0]?.[0]).toContain("hidden");
	});

	it("folds the homepage sample under the loader", async () => {
		const markdown = readFileSync(
			path.join(contentDir, "_home.md"),
			"utf8",
		).replace(/^---\n[\s\S]*?\n---\n/, "");
		const root = mount(await htmlOf(markdown));
		const sections = [...root.querySelectorAll(".ec-section")];
		expect(sections).toHaveLength(2);
		expect(sections[0]?.textContent).toContain("6 collapsed lines");
		expect(sections[0]?.textContent).toContain("Suspense");
		expect(sections[1]?.textContent).toContain("function Comments");
		expect(sections[1]?.querySelector(".twoslash-query-line")).not.toBeNull();

		const shown = root.cloneNode(true);
		if (!isElement(shown)) {
			throw new Error("expected an element");
		}
		for (const node of shown.querySelectorAll(
			".content-lines, summary, .twoslash-popup-container",
		)) {
			node.remove();
		}
		expect(shown.textContent).toContain("qc.ensure");
		expect(shown.textContent).toContain("useQuery(postQuery");
		expect(shown.textContent).not.toContain("function Comments");
		expect(shown.textContent).not.toContain("Suspense");
		const queries = [...root.querySelectorAll(".twoslash-query-line")];
		expect(queries[0]?.closest(".content-lines")).toBeNull();
	});
});
