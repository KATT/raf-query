import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";
import type { Plugin } from "vite";
import { parse as parseYaml } from "yaml";

import type { Doc, DocMeta, DocSection } from "../src/content/types.ts";
import { renderMarkdown } from "./markdown.ts";

export interface ContentOptions {
	/** Directory of the `.md` pages. */
	readonly contentDir: string;
	/** Directory with one `<id>.tsx` per demo. */
	readonly demosDir: string;
	/** Sidebar sections, in order. Every page's `section` must be one of them. */
	readonly sections: ReadonlyArray<string>;
	/** Absolute site URL, for `llms.txt`. */
	readonly siteUrl: string;
}

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

	function llmsTxt(sections: ReadonlyArray<DocSection>) {
		const lines = [
			"# raf-query",
			"",
			"> Render-as-you-fetch data fetching for React: queries start in route loaders and React Server Components, travel to components as serializable handles, and are read with `use()` under Suspense.",
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
		return lines.join("\n");
	}

	return {
		async generateBundle() {
			if (this.environment.name !== "client") {
				return;
			}
			const sections = await manifest();
			this.emitFile({
				fileName: "llms.txt",
				source: llmsTxt(sections),
				type: "asset",
			});
			for (const source of readSources(contentDir)) {
				this.emitFile({
					fileName: `docs/${source.slug}.md`,
					source: `# ${source.frontmatter.title}\n\n${source.markdown}`,
					type: "asset",
				});
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
