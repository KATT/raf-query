import { fileURLToPath } from "node:url";
import path from "node:path";

import rehypeShiki from "@shikijs/rehype";
import { createTransformerFactory, rendererRich } from "@shikijs/twoslash/core";
import GithubSlugger from "github-slugger";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import { toString } from "hast-util-to-string";
import type {
	Blockquote,
	Code,
	Link,
	Root as MdastRoot,
	Paragraph,
} from "mdast";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import type { ShikiTransformer } from "shiki";
import { createTwoslasher } from "twoslash/core";
// Twoslash runs the compiler through its JavaScript API, which TypeScript 7
// doesn't have.
import ts from "typescript6";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import type { DocHeading, DocSegment } from "../src/content/types.ts";

export interface RenderedMarkdown {
	readonly demos: ReadonlyArray<string>;
	readonly headings: ReadonlyArray<DocHeading>;
	readonly segments: ReadonlyArray<DocSegment>;
	readonly text: string;
	/** Each `twoslash` block's `// ^?` types, in order. */
	readonly typeQueries: ReadonlyArray<ReadonlyArray<string>>;
}

const alertTitles = {
	CAUTION: "Caution",
	IMPORTANT: "Important",
	NOTE: "Note",
	TIP: "Tip",
	WARNING: "Warning",
} as const;

type AlertKind = keyof typeof alertTitles;

function isAlertKind(value: string): value is AlertKind {
	return Object.hasOwn(alertTitles, value);
}

/** GitHub's `> [!NOTE]` alerts become `<aside class="callout">`. */
function remarkAlerts() {
	return (tree: MdastRoot) => {
		visit(tree, "blockquote", (node: Blockquote) => {
			const first = node.children[0];
			if (first?.type !== "paragraph") {
				return;
			}
			const text = first.children[0];
			if (text?.type !== "text") {
				return;
			}
			const match = /^\[!(\w+)\]\s*/.exec(text.value);
			const kind = match?.[1]?.toUpperCase();
			if (!match || !kind || !isAlertKind(kind)) {
				return;
			}
			text.value = text.value.slice(match[0].length);
			const title: Paragraph = {
				children: [{ type: "text", value: alertTitles[kind] }],
				data: { hProperties: { className: ["callout-title"] } },
				type: "paragraph",
			};
			node.children.unshift(title);
			node.data = {
				hName: "aside",
				hProperties: {
					className: ["callout", `callout-${kind.toLowerCase()}`],
				},
			};
		});
	};
}

/**
 * Links between pages are written as `./caching.md#section`, so they work on
 * GitHub too; the site serves them at `/docs/caching#section`.
 */
function remarkDocLinks() {
	return (tree: MdastRoot) => {
		visit(tree, "link", (node: Link) => {
			const match = /^(?:\.\/)?([\w-]+)\.md(#[\w-]+)?$/.exec(node.url);
			if (match) {
				node.url = `/docs/${match[1]}${match[2] ?? ""}`;
			}
		});
	};
}

/**
 * A fenced block with the `demo` language embeds a live demo:
 *
 * ````md
 * ```demo
 * starting-queries
 * ```
 * ````
 */
function remarkDemos(demos: Array<string>) {
	return () => (tree: MdastRoot) => {
		visit(tree, "code", (node: Code, index, parent) => {
			if (node.lang !== "demo" || !parent || index === undefined) {
				return;
			}
			const id = node.value.trim();
			demos.push(id);
			parent.children[index] = {
				children: [],
				data: { hName: "raf-demo", hProperties: { dataDemo: id } },
				type: "paragraph",
			};
		});
	};
}

/**
 * A fence's meta (`twoslash title="src/queries.ts"`) is `data` on the hast
 * `<code>`, which `rehype-raw` drops. Shiki also reads it from the
 * `metastring` property, which survives.
 */
function remarkCodeMeta() {
	return (tree: MdastRoot) => {
		visit(tree, "code", (node: Code) => {
			if (node.meta) {
				node.data = {
					...node.data,
					hProperties: { ...node.data?.hProperties, metastring: node.meta },
				};
			}
		});
	};
}

/** Ids and anchor links for `h2` / `h3`, collected for the table of contents. */
function rehypeHeadings(headings: Array<DocHeading>) {
	return () => (tree: HastRoot) => {
		const slugger = new GithubSlugger();
		visit(tree, "element", (node: Element) => {
			if (node.tagName !== "h2" && node.tagName !== "h3") {
				return;
			}
			const text = toString(node).trim();
			const id = slugger.slug(text);
			node.properties.id = id;
			headings.push({ depth: node.tagName === "h2" ? 2 : 3, id, text });
			node.children = [
				{
					children: node.children,
					properties: { className: ["heading-anchor"], href: `#${id}` },
					tagName: "a",
					type: "element",
				},
			];
		});
	};
}

/** Keeps a fence's `title="…"` and language on the highlighted `<pre>`. */
const codeMeta: ShikiTransformer = {
	name: "raf-query-docs:code-meta",
	pre(node) {
		// oxlint-disable-next-line eslint/no-underscore-dangle -- Shiki's name for the fence's meta string
		const raw = this.options.meta?.__raw ?? "";
		const title = /title="([^"]+)"/.exec(raw)?.[1];
		if (title) {
			node.properties["data-title"] = title;
		}
		node.properties["data-language"] = this.options.lang;
		node.properties.tabindex = "0";
	},
};

/** Wraps each highlighted block with its title and a copy button. */
function rehypeCodeBlocks() {
	return (tree: HastRoot) => {
		visit(tree, "element", (node: Element, index, parent) => {
			if (node.tagName !== "pre" || !parent || index === undefined) {
				return;
			}
			const title = node.properties["data-title"];
			const header: Array<ElementContent> = [];
			if (title) {
				header.push({
					children: [{ type: "text", value: String(title) }],
					properties: { className: ["code-title"] },
					tagName: "div",
					type: "element",
				});
			}
			parent.children[index] = {
				children: [
					...header,
					node,
					{
						children: [{ type: "text", value: "Copy" }],
						properties: {
							ariaLabel: "Copy code",
							className: ["code-copy"],
							dataCopy: "",
							type: "button",
						},
						tagName: "button",
						type: "element",
					},
				],
				properties: { className: ["code-block"] },
				tagName: "div",
				type: "element",
			};
			return "skip";
		});
	};
}

/** Splits the page at each demo, so React renders demos between HTML runs. */
function toSegments(tree: HastRoot): Array<DocSegment> {
	const segments: Array<DocSegment> = [];
	let run: Array<HastRoot["children"][number]> = [];
	const flush = () => {
		const html = toHtml({ children: run, type: "root" }).trim();
		if (html) {
			segments.push({ html, kind: "html" });
		}
		run = [];
	};
	for (const child of tree.children) {
		if (child.type === "element" && child.tagName === "raf-demo") {
			flush();
			segments.push({ id: String(child.properties.dataDemo), kind: "demo" });
		} else {
			run.push(child);
		}
	}
	flush();
	return segments;
}

const twoslashTransformers = new Map<string, ShikiTransformer>();

/**
 * Fences with `twoslash` in their meta are compiled, so hovering a name shows
 * its type, `// ^?` pins a type under the line, and `// @errors: 2345` shows
 * an expected error. A compile error the block doesn't expect fails the
 * build. Blocks resolve imports from `root`, so a hidden setup above
 * `// ---cut---` can import from `content/_twoslash.ts`.
 */
function twoslashTransformer(root: string) {
	const cached = twoslashTransformers.get(root);
	if (cached) {
		return cached;
	}
	const twoslasher = createTwoslasher({
		compilerOptions: {
			allowImportingTsExtensions: true,
			jsx: ts.JsxEmit.ReactJSX,
			lib: ["lib.es2024.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			noEmit: true,
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
	const transformer = createTransformerFactory(
		twoslasher,
		rendererRich({ queryRendering: "line" }),
	)({ explicitTrigger: true });
	twoslashTransformers.set(root, transformer);
	return transformer;
}

export interface RenderOptions {
	/** Where `twoslash` blocks resolve imports from. */
	readonly twoslashRoot: string;
}

export async function renderMarkdown(
	markdown: string,
	options: RenderOptions,
): Promise<RenderedMarkdown> {
	const headings: Array<DocHeading> = [];
	const demos: Array<string> = [];
	const typeQueries: Array<ReadonlyArray<string>> = [];
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkAlerts)
		.use(remarkDocLinks)
		.use(remarkDemos(demos))
		.use(remarkCodeMeta)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(rehypeHeadings(headings))
		.use(rehypeShiki, {
			defaultColor: false,
			themes: { dark: "github-dark", light: "github-light" },
			transformers: [
				twoslashTransformer(options.twoslashRoot),
				codeMeta,
				{
					name: "raf-query-docs:type-queries",
					pre() {
						const twoslash = this.meta.twoslash;
						if (twoslash) {
							typeQueries.push(
								twoslash.nodes.flatMap((node) =>
									node.type === "query" ? [node.text] : [],
								),
							);
						}
					},
				},
			],
		})
		.use(rehypeCodeBlocks);
	const tree = await processor.run(processor.parse(markdown));
	return {
		demos,
		headings,
		segments: toSegments(tree),
		text: toString(tree),
		typeQueries,
	};
}
