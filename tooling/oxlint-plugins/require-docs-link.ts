import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { defineRule } from "@oxlint/plugins";
import GithubSlugger from "github-slugger";
import { parseSync } from "oxc-parser";

/**
 * Every public export carries a link to its docs page, so an editor's hover
 * on `useQuery` or `invalidateMany` leads to the guide.
 *
 * Runs on a package's entry files (each path in its `package.json` `exports`).
 * For each name an entry exports, it follows `export … from`, `export *` and
 * `import` through the package's own modules to the declaration, and checks
 * that the JSDoc on it links to a page of the docs site (`baseUrl`), with an
 * `@see` tag:
 *
 * ```ts
 * /**
 *  * Read a query: …
 *  *
 *  * @see https://raf-query.katt.dev/docs/reading-queries
 *  *\/
 * export function useQuery(…) {}
 * ```
 *
 * The page must be a file in `contentDir`, and an `#anchor` a heading on it.
 * Re-exports of other packages (`export * from "@raf-query/core"`) are left
 * to that package's own entry.
 */

const DEFAULT_BASE_URL = "https://raf-query.katt.dev/docs/";
const DEFAULT_CONTENT_DIR = "www/content";

type RuleOptions = {
	readonly baseUrl?: string;
	readonly contentDir?: string;
};

type ParsedModule = {
	readonly program: any;
	readonly text: string;
};

type Declaration = {
	readonly file: string;
	readonly start: number;
	readonly text: string;
};

const moduleCache = new Map<
	string,
	{ mtimeMs: number; module: ParsedModule }
>();

function readModule(file: string): ParsedModule | undefined {
	let mtimeMs: number;
	try {
		mtimeMs = statSync(file).mtimeMs;
	} catch {
		return undefined;
	}
	const cached = moduleCache.get(file);
	if (cached?.mtimeMs === mtimeMs) {
		return cached.module;
	}
	const text = readFileSync(file, "utf8");
	const module: ParsedModule = { program: parseSync(file, text).program, text };
	moduleCache.set(file, { mtimeMs, module });
	return module;
}

function isRelative(specifier: string) {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function resolveModule(fromFile: string, specifier: string) {
	const base = path.resolve(path.dirname(fromFile), specifier);
	for (const candidate of [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		path.join(base, "index.ts"),
	]) {
		try {
			if (statSync(candidate).isFile()) {
				return candidate;
			}
		} catch {
			// Try the next candidate.
		}
	}
	return undefined;
}

function nameOf(node): string {
	return node.type === "Identifier" ? node.name : node.value;
}

function startOf(node): number {
	return node.range?.[0] ?? node.start;
}

/** The names a statement declares, without looking into `export`. */
function declaredNames(node): Array<string> {
	switch (node.type) {
		case "FunctionDeclaration":
		case "TSDeclareFunction":
		case "ClassDeclaration":
		case "TSTypeAliasDeclaration":
		case "TSInterfaceDeclaration":
		case "TSEnumDeclaration":
		case "TSModuleDeclaration":
			return node.id ? [nameOf(node.id)] : [];
		case "VariableDeclaration":
			return node.declarations.flatMap((declarator) =>
				declarator.id.type === "Identifier" ? [declarator.id.name] : [],
			);
		default:
			return [];
	}
}

type Found =
	| { readonly kind: "declaration"; readonly declaration: Declaration }
	| { readonly kind: "external" }
	| { readonly kind: "missing" };

/**
 * Where module `file` declares what it exports as `name`. `seen` stops
 * `export *` cycles.
 */
function findExport(
	file: string,
	module: ParsedModule,
	name: string,
	seen: Set<string>,
): Found {
	const key = `${file}#${name}`;
	if (seen.has(key)) {
		return { kind: "missing" };
	}
	seen.add(key);
	const starSources: Array<string> = [];
	for (const statement of module.program.body) {
		if (statement.type === "ExportNamedDeclaration") {
			if (
				statement.declaration &&
				declaredNames(statement.declaration).includes(name)
			) {
				return {
					kind: "declaration",
					declaration: { file, start: startOf(statement), text: module.text },
				};
			}
			for (const specifier of statement.specifiers) {
				if (nameOf(specifier.exported) !== name) {
					continue;
				}
				const local = nameOf(specifier.local);
				if (statement.source) {
					return findIn(file, statement.source.value, local, seen);
				}
				return findLocal(file, module, local, seen);
			}
		} else if (
			statement.type === "ExportAllDeclaration" &&
			!statement.exported
		) {
			starSources.push(statement.source.value);
		}
	}
	for (const source of starSources) {
		if (!isRelative(source)) {
			continue;
		}
		const found = findIn(file, source, name, seen);
		if (found.kind !== "missing") {
			return found;
		}
	}
	return { kind: "missing" };
}

function findIn(
	fromFile: string,
	specifier: string,
	name: string,
	seen: Set<string>,
): Found {
	if (!isRelative(specifier)) {
		return { kind: "external" };
	}
	const target = resolveModule(fromFile, specifier);
	const module = target && readModule(target);
	if (!target || !module) {
		return { kind: "missing" };
	}
	return findExport(target, module, name, seen);
}

/** A binding of `module` that is not exported where it's declared. */
function findLocal(
	file: string,
	module: ParsedModule,
	local: string,
	seen: Set<string>,
): Found {
	for (const statement of module.program.body) {
		if (statement.type === "ImportDeclaration") {
			for (const specifier of statement.specifiers) {
				if (specifier.local.name !== local) {
					continue;
				}
				if (specifier.type !== "ImportSpecifier") {
					return { kind: "missing" };
				}
				return findIn(
					file,
					statement.source.value,
					nameOf(specifier.imported),
					seen,
				);
			}
			continue;
		}
		const declaration =
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement;
		if (declaration && declaredNames(declaration).includes(local)) {
			return {
				kind: "declaration",
				declaration: { file, start: startOf(statement), text: module.text },
			};
		}
	}
	return { kind: "missing" };
}

/** The `/** … *\/` block right before `start`, if any. */
function jsdocBefore(text: string, start: number): string | undefined {
	const before = text.slice(0, start).trimEnd();
	if (!before.endsWith("*/")) {
		return undefined;
	}
	const open = before.lastIndexOf("/*");
	if (open === -1 || before[open + 2] !== "*") {
		return undefined;
	}
	return before.slice(open);
}

function escapeRegExp(value: string) {
	return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** Heading ids of a docs page, as the docs site builds them (`h2` / `h3`). */
function headingIds(markdown: string): Set<string> {
	const slugger = new GithubSlugger();
	const ids = new Set<string>();
	let inFence = false;
	for (const line of markdown.split("\n")) {
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			continue;
		}
		const heading = inFence ? null : /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(line);
		if (!heading) {
			continue;
		}
		const text = heading[1]
			.replaceAll(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replaceAll(/[`*_]/g, "");
		ids.add(slugger.slug(text.trim()));
	}
	return ids;
}

type LinkProblem =
	| { readonly messageId: "missing" }
	| { readonly messageId: "page" | "anchor"; readonly url: string };

function checkJsdoc(
	jsdoc: string | undefined,
	baseUrl: string,
	contentDir: string,
): LinkProblem | undefined {
	const urls = jsdoc
		? [
				...jsdoc.matchAll(
					new RegExp(`${escapeRegExp(baseUrl)}[\\w./#-]*[\\w/-]`, "g"),
				),
			].map((match) => match[0])
		: [];
	if (!jsdoc || !/@see\s/.test(jsdoc) || urls.length === 0) {
		return { messageId: "missing" };
	}
	for (const url of urls) {
		const [page = "", anchor] = url.slice(baseUrl.length).split("#");
		let markdown: string;
		try {
			markdown = readFileSync(
				path.join(contentDir, `${page.replace(/\/$/, "")}.md`),
				"utf8",
			);
		} catch {
			return { messageId: "page", url };
		}
		if (anchor && !headingIds(markdown).has(anchor)) {
			return { messageId: "anchor", url };
		}
	}
	return undefined;
}

const requireDocsLink = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Require every public export's JSDoc to link to its docs page",
		},
		schema: [
			{
				type: "object",
				properties: {
					baseUrl: { type: "string" },
					contentDir: { type: "string" },
				},
				additionalProperties: false,
			},
		],
		messages: {
			missing:
				"`{{name}}` is public: add a JSDoc `@see {{baseUrl}}<page>` link to its docs to the declaration in {{file}}.",
			page: "`{{name}}` links to {{url}}, which is not a docs page (no {{contentDir}}/<page>.md). Declared in {{file}}.",
			anchor:
				"`{{name}}` links to {{url}}, whose page has no heading with that anchor. Declared in {{file}}.",
			unresolved:
				"Can't find the declaration of the public export `{{name}}` to check its docs link.",
		},
	},

	create(context) {
		// SAFETY: `meta.schema` validates the options' shape.
		const options = (context.options[0] ?? {}) as RuleOptions;
		const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
		const contentDirOption = options.contentDir ?? DEFAULT_CONTENT_DIR;
		const contentDir = path.resolve(context.cwd, contentDirOption);
		const filename: string = context.physicalFilename ?? context.filename;
		const self: ParsedModule = {
			get program() {
				return context.sourceCode.ast;
			},
			get text() {
				return context.sourceCode.text;
			},
		};

		function check(node, name: string, found: Found) {
			if (found.kind === "external") {
				return;
			}
			if (found.kind === "missing") {
				context.report({ node, messageId: "unresolved", data: { name } });
				return;
			}
			const { declaration } = found;
			const problem = checkJsdoc(
				jsdocBefore(declaration.text, declaration.start),
				baseUrl,
				contentDir,
			);
			if (!problem) {
				return;
			}
			context.report({
				node,
				messageId: problem.messageId,
				data: {
					name,
					baseUrl,
					contentDir: contentDirOption,
					file: path.relative(context.cwd, declaration.file) || filename,
					url: problem.messageId === "missing" ? "" : problem.url,
				},
			});
		}

		/** Every name module `file` exports, `export *` included. */
		function exportedNames(
			file: string,
			module: ParsedModule,
			seen: Set<string>,
		): Array<string> {
			if (seen.has(file)) {
				return [];
			}
			seen.add(file);
			const names: Array<string> = [];
			for (const statement of module.program.body) {
				if (statement.type === "ExportNamedDeclaration") {
					if (statement.declaration) {
						names.push(...declaredNames(statement.declaration));
					}
					names.push(
						...statement.specifiers.map((specifier) =>
							nameOf(specifier.exported),
						),
					);
				} else if (statement.type === "ExportAllDeclaration") {
					if (statement.exported || !isRelative(statement.source.value)) {
						continue;
					}
					const target = resolveModule(file, statement.source.value);
					const targetModule = target && readModule(target);
					if (target && targetModule) {
						names.push(...exportedNames(target, targetModule, seen));
					}
				}
			}
			return [...new Set(names)];
		}

		/** Overloads declare a name more than once: check the first. */
		const checkedHere = new Set<string>();

		return {
			ExportNamedDeclaration(node) {
				if (node.declaration) {
					for (const name of declaredNames(node.declaration)) {
						if (checkedHere.has(name)) {
							continue;
						}
						checkedHere.add(name);
						const reportOn =
							"id" in node.declaration && node.declaration.id
								? node.declaration.id
								: node.declaration;
						check(reportOn, name, {
							kind: "declaration",
							declaration: {
								file: filename,
								start: startOf(node),
								text: context.sourceCode.text,
							},
						});
					}
				}
				for (const specifier of node.specifiers) {
					const name = nameOf(specifier.exported);
					const local = nameOf(specifier.local);
					check(
						specifier,
						name,
						node.source
							? findIn(filename, node.source.value, local, new Set())
							: findLocal(filename, self, local, new Set()),
					);
				}
			},

			ExportAllDeclaration(node) {
				if (node.exported || !isRelative(node.source.value)) {
					return;
				}
				const target = resolveModule(filename, node.source.value);
				const module = target && readModule(target);
				if (!target || !module) {
					context.report({
						node,
						messageId: "unresolved",
						data: { name: `* from ${node.source.value}` },
					});
					return;
				}
				for (const name of exportedNames(target, module, new Set())) {
					check(node, name, findExport(target, module, name, new Set()));
				}
			},
		};
	},
});

export { requireDocsLink };
