import { fileURLToPath } from "node:url";
import path from "node:path";

import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import type { Element, ElementContent, Text } from "hast";
import rehypeExpressiveCode, {
	ExpressiveCodeBlock,
	type ExpressiveCodeBlockOptions,
	type ExpressiveCodePlugin,
} from "rehype-expressive-code";
import { createHighlighter, type Highlighter } from "shiki";
import { createTwoslasher, type TwoslashReturn } from "twoslash/core";
// Twoslash runs the compiler through its JavaScript API, which TypeScript 7
// doesn't have.
import ts from "typescript6";

/**
 * Code blocks are rendered by Expressive Code, so a fence can fold lines with
 * `collapse={4-9}` the way Astro's docs do. `collapsible-start` keeps the
 * summary on screen, so the lines can close again.
 *
 * Twoslash still compiles `twoslash` fences first (TypeScript 6, the same
 * virtual project as before). The fold then sees the code that is left after
 * `// ---cut---` and the `// ^?` markers, and those line numbers are the ones
 * in `collapse={}`.
 */

const twoslashers = new Map<
	string,
	(code: string, lang?: string) => TwoslashReturn
>();
const twoslashByBlock = new WeakMap<ExpressiveCodeBlock, TwoslashReturn>();

interface DocsFileData {
	twoslashRoot: string;
	typeQueries: Array<ReadonlyArray<string>>;
}

interface DocsCodeFile {
	data: DocsFileData;
}

function twoslasherFor(root: string) {
	const cached = twoslashers.get(root);
	if (cached) {
		return cached;
	}
	const twoslasher = createTwoslasher({
		compilerOptions: {
			allowImportingTsExtensions: true,
			baseUrl: root,
			jsx: ts.JsxEmit.ReactJSX,
			lib: ["lib.es2024.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			noEmit: true,
			// Next.js samples import `~/query-client.ts`; stubs live next to the pages.
			paths: { "~/*": ["./*"] },
			skipLibCheck: true,
			strict: true,
			target: ts.ScriptTarget.ES2024,
			types: [],
		},
		tsLibDirectory: path.dirname(
			fileURLToPath(import.meta.resolve("typescript6")),
		),
		// @ts-expect-error -- twoslash types `tsModule` as the `typescript` package, which here is TypeScript 7's, with no JavaScript API
		tsModule: ts,
		vfsRoot: root,
	});
	twoslashers.set(root, twoslasher);
	return twoslasher;
}

function isTwoslash(meta: string) {
	return /\btwoslash\b/.test(meta);
}

/** The block Expressive Code renders. Twoslash fences are already cut. */
export function createDocsBlock(
	input: ExpressiveCodeBlockOptions,
	file: DocsCodeFile,
): ExpressiveCodeBlock {
	const meta = input.meta ?? "";
	if (!isTwoslash(meta)) {
		return new ExpressiveCodeBlock(input);
	}
	const root = file.data.twoslashRoot;
	const result = twoslasherFor(root)(input.code, input.language || "ts");
	const block = new ExpressiveCodeBlock({
		...input,
		code: result.code.replace(/\n+$/u, ""),
		language: result.meta.extension || input.language,
	});
	twoslashByBlock.set(block, result);
	file.data.typeQueries.push(
		result.nodes.flatMap((node) => (node.type === "query" ? [node.text] : [])),
	);
	return block;
}

function classes(node: Element) {
	const value = node.properties.class ?? node.properties.className;
	if (Array.isArray(value)) {
		return value.map(String);
	}
	if (value == null || value === false) {
		return [];
	}
	return String(value).split(/\s+/);
}

function hasClass(node: Element, name: string) {
	return classes(node).includes(name);
}

function textOf(node: ElementContent): string {
	if (node.type === "text") {
		return node.value;
	}
	if (node.type !== "element") {
		return "";
	}
	return node.children.map(textOf).join("");
}

function cloneWithText(node: Element, value: string): Element {
	return {
		...node,
		children: [{ type: "text", value }],
	};
}

/**
 * Wraps the tokens covering `[start, end)` in `div.code`. Popup text is added
 * inside the wrapper, so later ranges must be applied from the end of the line.
 */
function wrapRange(
	parent: Element,
	start: number,
	end: number,
	wrap: (nodes: Array<ElementContent>) => Element,
) {
	if (end <= start) {
		return;
	}
	let cursor = 0;
	const next: Array<ElementContent> = [];
	const inside: Array<ElementContent> = [];
	const flush = () => {
		if (inside.length > 0) {
			next.push(wrap(inside.splice(0)));
		}
	};
	for (const child of parent.children) {
		const text = textOf(child);
		const childStart = cursor;
		const childEnd = cursor + text.length;
		cursor = childEnd;
		if (text.length === 0 || childEnd <= start || childStart >= end) {
			flush();
			next.push(child);
			continue;
		}
		if (childStart >= start && childEnd <= end) {
			inside.push(child);
			continue;
		}
		flush();
		const localStart = Math.max(0, start - childStart);
		const localEnd = Math.min(text.length, end - childStart);
		if (child.type === "text") {
			if (localStart > 0) {
				next.push({ type: "text", value: text.slice(0, localStart) });
			}
			next.push(
				wrap([{ type: "text", value: text.slice(localStart, localEnd) }]),
			);
			if (localEnd < text.length) {
				next.push({ type: "text", value: text.slice(localEnd) });
			}
			continue;
		}
		if (
			child.type === "element" &&
			child.children.length === 1 &&
			child.children[0]?.type === "text"
		) {
			const value = child.children[0].value;
			if (localStart > 0) {
				next.push(cloneWithText(child, value.slice(0, localStart)));
			}
			next.push(
				wrap([cloneWithText(child, value.slice(localStart, localEnd))]),
			);
			if (localEnd < value.length) {
				next.push(cloneWithText(child, value.slice(localEnd)));
			}
			continue;
		}
		next.push(child);
	}
	flush();
	parent.children = next;
}

function codeRow(line: Element) {
	if (hasClass(line, "code")) {
		return line;
	}
	for (const child of line.children) {
		if (child.type === "element" && hasClass(child, "code")) {
			return child;
		}
	}
	return undefined;
}

let highlighter: Promise<Highlighter> | undefined;
const popupCache = new Map<string, Promise<Array<ElementContent>>>();

function highlightedType(text: string, lang: string) {
	const key = `${lang}\n${text}`;
	const cached = popupCache.get(key);
	if (cached) {
		return cached;
	}
	const pending = (highlighter ??= createHighlighter({
		langs: ["tsx"],
		themes: ["github-dark", "github-light"],
	})).then((engine) =>
		engine.codeToHast(text, {
			defaultColor: false,
			lang: "tsx",
			structure: "inline",
			themes: { dark: "github-dark", light: "github-light" },
		}),
	);
	const nodes = pending.then(
		(tree) => {
			const code: Element = {
				children: tree.children.filter(
					(child): child is Element | Text =>
						child.type === "element" || child.type === "text",
				),
				properties: { className: ["shiki", "twoslash-popup-code"] },
				tagName: "code",
				type: "element",
			};
			return [code];
		},
		() => [{ type: "text" as const, value: text }],
	);
	popupCache.set(key, nodes);
	return nodes;
}

function popupContainer(children: Array<ElementContent>): Element {
	return {
		children: [
			{
				children: [],
				properties: { className: ["twoslash-popup-arrow"] },
				tagName: "div",
				type: "element",
			},
			...children,
		],
		properties: { className: ["twoslash-popup-container"] },
		tagName: "span",
		type: "element",
	};
}

function findPre(node: Element): Element | undefined {
	if (node.tagName === "pre") {
		return node;
	}
	for (const child of node.children) {
		if (child.type === "element") {
			const pre = findPre(child);
			if (pre) {
				return pre;
			}
		}
	}
	return undefined;
}

function addClass(node: Element, name: string) {
	const list = classes(node);
	if (!list.includes(name)) {
		node.properties.className = [...list, name];
	}
}

/** Hover popups, pinned `// ^?` types, and expected errors, after highlighting. */
function docsTwoslashPlugin(): ExpressiveCodePlugin {
	return {
		hooks: {
			postprocessRenderedBlock(context) {
				const pre = findPre(context.renderData.blockAst);
				if (!pre) {
					return;
				}
				const title = /title="([^"]+)"/.exec(context.codeBlock.meta)?.[1];
				if (title) {
					pre.properties["data-title"] = title;
				}
				pre.properties.tabindex = "0";
				if (twoslashByBlock.has(context.codeBlock)) {
					addClass(pre, "twoslash");
				}
			},
			async postprocessRenderedLine(context) {
				const parent = context.line.parent;
				const result = parent ? twoslashByBlock.get(parent) : undefined;
				if (!result) {
					return;
				}
				const code = codeRow(context.renderData.lineAst);
				if (!code) {
					return;
				}
				const onLine = result.nodes.filter(
					(node) => node.line === context.lineIndex,
				);
				const ranges = [];
				for (const node of onLine) {
					if (node.type === "error") {
						ranges.push(node);
					} else if (
						node.type === "hover" &&
						!onLine.some(
							(other) =>
								other.type === "error" &&
								other.character === node.character &&
								other.length === node.length,
						)
					) {
						ranges.push(node);
					}
				}
				ranges.sort((a, b) => b.character - a.character);
				for (const node of ranges) {
					const end = node.character + node.length;
					if (node.type === "hover") {
						const body = await highlightedType(
							node.text,
							parent?.language ?? "ts",
						);
						const docs = node.docs
							? [
									{
										children: [{ type: "text" as const, value: node.docs }],
										properties: { className: ["twoslash-popup-docs"] },
										tagName: "div",
										type: "element" as const,
									},
								]
							: [];
						wrapRange(code, node.character, end, (nodes) => ({
							children: [popupContainer([...body, ...docs]), ...nodes],
							properties: { className: ["twoslash-hover"] },
							tagName: "span",
							type: "element",
						}));
					} else {
						wrapRange(code, node.character, end, (nodes) => ({
							children: nodes,
							properties: { className: ["twoslash-error"] },
							tagName: "span",
							type: "element",
						}));
					}
				}
				for (const node of onLine) {
					if (node.type === "query") {
						const body = await highlightedType(
							node.text,
							parent?.language ?? "ts",
						);
						code.children.push({
							children: [
								{ type: "text", value: " ".repeat(node.character) },
								popupContainer(body),
							],
							properties: {
								className: ["twoslash-meta-line", "twoslash-query-line"],
							},
							tagName: "div",
							type: "element",
						});
					} else if (node.type === "error") {
						code.children.push({
							children: [{ type: "text", value: node.text }],
							properties: {
								className: ["twoslash-meta-line", "twoslash-error-line"],
							},
							tagName: "div",
							type: "element",
						});
					}
				}
			},
		},
		name: "raf-query docs twoslash",
	};
}

/**
 * Expressive Code for every fence: Shiki themes, folds, and our Twoslash.
 * The transform is built once; unified calls this plugin for every page.
 */
export function docsHighlighter() {
	const transform = rehypeExpressiveCode({
		customCreateBlock: (args) => {
			// SAFETY: `renderMarkdown` puts `twoslashRoot` and `typeQueries` on the VFile `data`, and rehype passes that file through.
			const file = args.file as unknown as DocsCodeFile;
			return createDocsBlock(args.input, file);
		},
		defaultProps: { collapseStyle: "collapsible-start" },
		frames: false,
		plugins: [docsTwoslashPlugin(), pluginCollapsibleSections()],
		tabWidth: 2,
		themeCssSelector: (theme) => (theme.type === "dark" ? ".dark" : ":root"),
		themes: ["github-light", "github-dark"],
		useDarkModeMediaQuery: false,
		useStyleReset: false,
	});
	return () => transform;
}
