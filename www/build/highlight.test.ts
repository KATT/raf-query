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

function isElement(node: Node): node is Element {
	return node.nodeType === Node.ELEMENT_NODE;
}

describe("Expressive Code blocks", () => {
	it("highlights a fence and keeps its title", async () => {
		const root = mount(
			await htmlOf('```ts title="src/queries.ts"\nconst value = 1;\n```'),
		);
		expect(root.querySelector(".expressive-code")).not.toBeNull();
		expect(root.querySelector(".ec-line")?.textContent).toContain(
			"const value = 1;",
		);
		expect(root.querySelector(".code-title")?.textContent).toBe(
			"src/queries.ts",
		);
		expect(root.querySelector("button")?.textContent).toBe("Copy");
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

	it("pins a query type and records it for agent markdown", async () => {
		const result = await rendered(
			["```ts twoslash", "const value = 1;", "//    ^?", "```"].join("\n"),
		);
		const root = mount(
			result.segments
				.map((segment) => (segment.kind === "html" ? segment.html : ""))
				.join(""),
		);
		const query = root.querySelector(".twoslash-query-line");
		expect(query?.textContent).toContain("value");
		expect(
			query?.querySelector(".twoslash-popup-code [style*='--shiki-light']"),
		).not.toBeNull();
		expect(result.typeQueries[0]?.[0]).toContain("value");
	});

	it("cuts the hidden setup out of the highlighted block", async () => {
		const root = mount(
			await htmlOf(
				[
					"```ts twoslash",
					"const hidden = 1;",
					"// ---cut---",
					"const shown = hidden;",
					"```",
				].join("\n"),
			),
		);
		const lines = [...root.querySelectorAll(".ec-line")].map((line) => {
			const copy = line.cloneNode(true);
			if (isElement(copy)) {
				for (const popup of copy.querySelectorAll(
					".twoslash-popup-container",
				)) {
					popup.remove();
				}
			}
			return copy.textContent ?? "";
		});
		expect(lines).toEqual(["const shown = hidden;"]);
	});
});
