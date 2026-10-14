import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "@effect/vitest";

import { stripCollapseMarkers } from "./collapse.ts";
import { renderMarkdown } from "./markdown.ts";

// `pnpm test` runs in `www/`. Vitest serves this file from a non-file URL.
const contentDir = path.resolve("content");

async function htmlOf(markdown: string) {
	const rendered = await renderMarkdown(markdown, {
		twoslashRoot: contentDir,
	});
	return rendered.segments
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

function fence(body: string) {
	return `\`\`\`ts\n${body}\n\`\`\``;
}

describe("collapse regions", () => {
	it("folds a range and keeps it in the block", async () => {
		const root = mount(
			await htmlOf(
				fence(
					[
						"function demo() {",
						"\t// ---collapse---",
						"\tconst a = 1;",
						"\tconst b = 2;",
						"\t// ---/collapse---",
						"\treturn a;",
						"}",
					].join("\n"),
				),
			),
		);
		const pre = root.querySelector("pre");
		const button = pre?.querySelector("button[data-collapse]");
		const body = pre?.querySelector(".code-collapse-body");
		expect(
			button?.querySelector(".code-collapse-when-closed")?.textContent,
		).toBe("2 collapsed lines");
		expect(
			button?.querySelector(".code-collapse-when-open")?.hasAttribute("hidden"),
		).toBe(true);
		expect(button?.getAttribute("aria-expanded")).toBe("false");
		expect(button?.getAttribute("aria-controls")).toBe("code-collapse-1");
		expect(button?.getAttribute("style")).toBe("--collapse-indent: 2");
		expect(body?.hasAttribute("hidden")).toBe(true);
		expect(body?.textContent).toContain("const a = 1;");
		expect(body?.textContent).toContain("const b = 2;");
		expect(root.textContent).not.toContain("---collapse---");
		expect(pre?.textContent).toContain("return a;");
	});

	it("counts a blank line in the folded range", async () => {
		const root = mount(
			await htmlOf(
				fence("// ---collapse---\n\nconst a = 1;\n// ---/collapse---"),
			),
		);
		expect(root.querySelector(".code-collapse-when-closed")?.textContent).toBe(
			"2 collapsed lines",
		);
	});

	it("leaves a block without markers unchanged", async () => {
		const root = mount(await htmlOf(fence("const a = 1;")));
		expect(root.querySelector("[data-collapse]")).toBeNull();
	});

	it("rejects a region that is unclosed, empty, or nested", async () => {
		await expect(
			htmlOf(fence("// ---collapse---\nconst a = 1;")),
		).rejects.toThrow(/no \/\/ ---\/collapse---/);
		await expect(
			htmlOf(fence("// ---collapse---\n// ---/collapse---")),
		).rejects.toThrow(/empty/);
		await expect(
			htmlOf(
				fence(
					"// ---collapse---\n// ---collapse---\nconst a = 1;\n// ---/collapse---\n// ---/collapse---",
				),
			),
		).rejects.toThrow(/Nested/);
		await expect(
			htmlOf(fence("const a = 1;\n// ---/collapse---")),
		).rejects.toThrow(/no \/\/ ---collapse--- before/);
	});

	it("keeps a pinned type with the lines it belongs to", async () => {
		const root = mount(
			await htmlOf(
				[
					"```ts twoslash",
					"const value = 1;",
					"// ---collapse---",
					"const hidden = value;",
					"//       ^?",
					"// ---/collapse---",
					"const after = hidden;",
					"```",
				].join("\n"),
			),
		);
		const query = root.querySelector(".twoslash-query-line");
		expect(query?.closest(".code-collapse-body")).not.toBeNull();
		expect(query?.textContent).toContain("hidden");
	});

	it("folds the homepage sample under the loader", async () => {
		const markdown = readFileSync(
			path.join(contentDir, "_home.md"),
			"utf8",
		).replace(/^---\n[\s\S]*?\n---\n/, "");
		const root = mount(await htmlOf(markdown));
		const bodies = [...root.querySelectorAll(".code-collapse-body")];
		expect(bodies.map((body) => body.id)).toEqual([
			"code-collapse-1",
			"code-collapse-2",
		]);
		expect(bodies[0]?.textContent).toContain("Suspense");
		expect(bodies[1]?.textContent).toContain("function Comments");
		expect(bodies[1]?.querySelector(".twoslash-query-line")).not.toBeNull();

		const shown = root.cloneNode(true);
		if (!isElement(shown)) {
			throw new Error("expected an element");
		}
		for (const node of shown.querySelectorAll(
			".code-collapse-body, .code-collapse-toggle, .twoslash-popup-container",
		)) {
			node.remove();
		}
		expect(shown.textContent).toContain("qc.ensure");
		expect(shown.textContent).toContain("useQuery(postQuery");
		expect(shown.textContent).not.toContain("function Comments");
		expect(shown.textContent).not.toContain("Suspense");
		const queries = [...root.querySelectorAll(".twoslash-query-line")];
		expect(queries[0]?.closest(".code-collapse-body")).toBeNull();
	});
});

describe("stripCollapseMarkers", () => {
	it("drops the markers and keeps the lines", () => {
		expect(
			stripCollapseMarkers(
				"a\n// ---collapse---\n\tb\n\t// ---/collapse---\nc\n",
			),
		).toBe("a\n\tb\nc\n");
	});
});
