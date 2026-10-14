import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";
import type { Connect, Plugin } from "vite";
import { parse as parseYaml } from "yaml";

import type { Doc, DocMeta, DocSection } from "../src/content/types.ts";
import { renderMarkdown } from "./markdown.ts";

export interface ContentOptions {
	/** Directory of the `.md` pages. */
	readonly contentDir: string;
	/** Directory with one `<id>.tsx` per demo. */
	readonly demosDir: string;
	/** Where `demosDir` is browsable, for the markdown pages' demo links. */
	readonly demosUrl: string;
	/** Sidebar sections, in order. Every page's `section` must be one of them. */
	readonly sections: ReadonlyArray<string>;
	/** Absolute site URL, for `llms.txt` and the markdown pages. */
	readonly siteUrl: string;
}

/** The `Accept` header agents send to get markdown instead of HTML. */
export const acceptsMarkdown = /\btext\/markdown\b/;

const Frontmatter = Schema.Struct({
	description: Schema.String,
	order: Schema.Number,
	section: Schema.String,
	title: Schema.String,
});

type Frontmatter = typeof Frontmatter.Type;

const decodeFrontmatter = Schema.decodeUnknownSync(Frontmatter);

interface Source {
	readonly file: string;
	readonly frontmatter: Frontmatter;
	readonly markdown: string;
	readonly slug: string;
}

const manifestId = "virtual:docs-manifest";
const resolvedManifestId = `\0${manifestId}`;

function parseFrontmatter(file: string, raw: string) {
	const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
	if (!match?.[1]) {
		throw new Error(`${file}: missing frontmatter`);
	}
	let frontmatter: Frontmatter;
	try {
		frontmatter = decodeFrontmatter(parseYaml(match[1]));
	} catch (error) {
		throw new Error(`${file}: invalid frontmatter`, { cause: error });
	}
	return { frontmatter, markdown: raw.slice(match[0].length) };
}

function lastModified(file: string) {
	try {
		const date = execFileSync(
			"git",
			["log", "-1", "--format=%cI", "--", file],
			{
				cwd: path.dirname(file),
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			},
		).trim();
		return date || undefined;
	} catch {
		return undefined;
	}
}

export function readSources(contentDir: string): ReadonlyArray<Source> {
	return (
		readdirSync(contentDir)
			// `_name.md` files are page fragments (the home page's code), not pages.
			.filter((name) => name.endsWith(".md") && !name.startsWith("_"))
			.map((name) => {
				const file = path.join(contentDir, name);
				return {
					file,
					slug: name.slice(0, -".md".length),
					...parseFrontmatter(file, readFileSync(file, "utf8")),
				};
			})
	);
}

/** Page paths for prerendering and the sitemap. */
export function docPages(contentDir: string) {
	return readSources(contentDir).map((source) => ({
		lastModified: lastModified(source.file),
		path: `/docs/${source.slug}`,
	}));
}

/**
 * Compiles `content/*.md` at build time. Each page imports as a module of
 * pre-highlighted HTML segments (its own chunk, so the browser loads only the
 * pages it visits), and `virtual:docs-manifest` lists every page for the nav,
 * search and SEO. The client build also gets `llms.txt` and each page's
 * markdown source at `/docs/<slug>.md`.
 */
export function docsContent(options: ContentOptions): Plugin {
	const contentDir = path.resolve(options.contentDir);
	const rendered = new Map<string, Promise<Doc>>();

	function render(source: Source): Promise<Doc> {
		const cached = rendered.get(source.file);
		if (cached) {
			return cached;
		}
		const doc = renderMarkdown(source.markdown).then((result) => {
			for (const id of result.demos) {
				if (!existsSync(path.join(options.demosDir, `${id}.tsx`))) {
					throw new Error(`${source.file}: unknown demo "${id}"`);
				}
			}
			return {
				demos: result.demos,
				description: source.frontmatter.description,
				headings: result.headings,
				lastModified: lastModified(source.file),
				section: source.frontmatter.section,
				segments: result.segments,
				slug: source.slug,
				title: source.frontmatter.title,
			};
		});
		rendered.set(source.file, doc);
		return doc;
	}

	async function manifest(): Promise<ReadonlyArray<DocSection>> {
		const sources = readSources(contentDir);
		for (const source of sources) {
			if (!options.sections.includes(source.frontmatter.section)) {
				throw new Error(
					`${source.file}: section "${source.frontmatter.section}" isn't one of ${options.sections.join(", ")}`,
				);
			}
		}
		const docs = await Promise.all(
			sources.map(async (source) => ({
				doc: await render(source),
				order: source.frontmatter.order,
			})),
		);
		return options.sections.map((title) => ({
			docs: docs
				.filter((entry) => entry.doc.section === title)
				.toSorted((a, b) => a.order - b.order)
				.map((entry): DocMeta => ({
					demos: entry.doc.demos,
					description: entry.doc.description,
					headings: entry.doc.headings,
					lastModified: entry.doc.lastModified,
					section: entry.doc.section,
					slug: entry.doc.slug,
					title: entry.doc.title,
				})),
			title,
		}));
	}

	const intro = [
		"# raf-query",
		"",
		"> Render-as-you-fetch data fetching for React: queries start in route loaders and React Server Components, travel to components as serializable handles, and are read with `use()` under Suspense.",
		"",
	];

	/**
	 * A page as agents read it: links point at the other pages' markdown, and
	 * each demo, which only runs in a browser, becomes a link to the page and
	 * to the demo's code.
	 */
	function pageMarkdown(source: Source) {
		const url = `${options.siteUrl}/docs/${source.slug}`;
		const body = source.markdown
			.replaceAll(
				/\]\((?:\.\/)?([\w-]+)\.md(#[\w-]+)?\)/g,
				(link, slug, hash) =>
					`](${options.siteUrl}/docs/${slug}.md${hash ?? ""})`,
			)
			.replaceAll(
				/^```demo\n([\w-]+)\n```$/gm,
				(block, id) =>
					`> [!NOTE]\n> The [web version of this page](${url}) has an interactive demo here. Its code: [${id}.tsx](${options.demosUrl}/${id}.tsx).`,
			);
		return [
			`# ${source.frontmatter.title}`,
			"",
			`> ${source.frontmatter.description}`,
			"",
			body.trim(),
			"",
		].join("\n");
	}

	/** `llms.txt` (https://llmstxt.org): what the library is, and every page. */
	function llmsTxt(sections: ReadonlyArray<DocSection>) {
		const lines = [
			...intro,
			"Every page is also markdown: add `.md` to its URL, or request it with `Accept: text/markdown`.",
			"",
		];
		for (const section of sections) {
			lines.push(`## ${section.title}`, "");
			for (const doc of section.docs) {
				lines.push(
					`- [${doc.title}](${options.siteUrl}/docs/${doc.slug}.md): ${doc.description}`,
				);
			}
			lines.push("");
		}
		lines.push(
			"## Optional",
			"",
			`- [Full documentation](${options.siteUrl}/llms-full.txt): every page above in one file`,
			"",
		);
		return lines.join("\n");
	}

	/**
	 * Files for agents, by URL path: `llms.txt`, `llms-full.txt`, each page's
	 * markdown at `/docs/<slug>.md`, `/index.md` (the home page's markdown,
	 * the same as `llms.txt`) and `/404.md`.
	 */
	async function agentFiles() {
		const sections = await manifest();
		const sources = new Map(
			readSources(contentDir).map((source) => [source.slug, source]),
		);
		const pages = sections
			.flatMap((section) => section.docs)
			.flatMap((doc) => {
				const source = sources.get(doc.slug);
				return source ? [source] : [];
			});
		const files = new Map<string, string>();
		files.set("/llms.txt", llmsTxt(sections));
		files.set("/index.md", llmsTxt(sections));
		files.set(
			"/404.md",
			`# Not found\n\nThere is no page at this URL. [llms.txt](${options.siteUrl}/llms.txt) lists every page.\n`,
		);
		files.set(
			"/llms-full.txt",
			[
				...intro,
				...pages.map(
					(source) =>
						`---\n\nSource: ${options.siteUrl}/docs/${source.slug}\n\n${pageMarkdown(source)}`,
				),
			].join("\n"),
		);
		for (const source of pages) {
			files.set(`/docs/${source.slug}.md`, pageMarkdown(source));
		}
		return files;
	}

	/**
	 * The dev and preview servers answer like the deployed site
	 * (`build/vercel-output.ts`): agent files at their paths, and a page's
	 * markdown at the page's own URL for `Accept: text/markdown`.
	 */
	function serveAgentFiles(server: { readonly middlewares: Connect.Server }) {
		server.middlewares.use((request, response, next) => {
			const { pathname } = new URL(request.url ?? "/", "http://localhost");
			const wantsMarkdown = acceptsMarkdown.test(request.headers.accept ?? "");
			const filePath =
				wantsMarkdown && /^\/(?:docs\/[\w-]+)?$/.test(pathname)
					? `${pathname === "/" ? "/index" : pathname}.md`
					: pathname;
			if (!/\.(?:md|txt)$/.test(filePath) || filePath === "/robots.txt") {
				next();
				return;
			}
			agentFiles().then((files) => {
				const file = files.get(filePath) ?? files.get("/404.md");
				if (file === undefined || (!wantsMarkdown && !files.has(filePath))) {
					next();
					return;
				}
				response.statusCode = files.has(filePath) ? 200 : 404;
				response.setHeader(
					"Content-Type",
					filePath.endsWith(".md")
						? "text/markdown; charset=utf-8"
						: "text/plain; charset=utf-8",
				);
				response.setHeader("Vary", "Accept");
				response.end(file);
			}, next);
		});
	}

	return {
		configurePreviewServer: serveAgentFiles,
		configureServer: serveAgentFiles,
		async generateBundle() {
			if (this.environment.name !== "client") {
				return;
			}
			for (const [urlPath, source] of await agentFiles()) {
				this.emitFile({ fileName: urlPath.slice(1), source, type: "asset" });
			}
		},
		hotUpdate(context) {
			if (!context.file.startsWith(contentDir)) {
				return undefined;
			}
			rendered.delete(context.file);
			const module =
				this.environment.moduleGraph.getModuleById(resolvedManifestId);
			if (module) {
				this.environment.moduleGraph.invalidateModule(module);
				return [...context.modules, module];
			}
			return undefined;
		},
		async load(id) {
			if (id !== resolvedManifestId) {
				return undefined;
			}
			const sections = await manifest();
			return `export const sections = ${JSON.stringify(sections)};`;
		},
		name: "raf-query-docs:content",
		resolveId(id) {
			return id === manifestId ? resolvedManifestId : undefined;
		},
		async transform(code, id) {
			const file = id.split("?")[0] ?? id;
			if (!file.startsWith(contentDir) || !file.endsWith(".md")) {
				return undefined;
			}
			const name = path.basename(file);
			const source = {
				file,
				slug: name.slice(0, -".md".length),
				...parseFrontmatter(file, code),
			};
			rendered.delete(file);
			const doc = await render(source);
			return { code: `export default ${JSON.stringify(doc)};`, map: null };
		},
	};
}
