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
import { unified } from "unified";
import { visit } from "unist-util-visit";

import type { DocHeading, DocSegment } from "../src/content/types.ts";
import { docsHighlighter } from "./expressive-code.ts";

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
 * `<code>`, which `rehype-raw` drops. Expressive Code reads it from the
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

/** One engine for every page, so theme CSS is built once. */
const highlight = docsHighlighter();

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
		.use(highlight)
		.use(rehypeCodeBlocks);
	const tree = await processor.run(processor.parse(markdown), {
		data: { twoslashRoot: options.twoslashRoot, typeQueries },
		value: markdown,
	});
	return {
		demos,
		headings,
		segments: toSegments(tree),
		text: toString(tree),
		typeQueries,
	};
}
