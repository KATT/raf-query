import { readFileSync } from "node:fs";
import path from "node:path";

import { appOf } from "./example-apps.ts";

export interface ExpandedSnippets {
	/** Every file the page includes, for the dev server to watch. */
	readonly files: ReadonlyArray<string>;
	readonly markdown: string;
}

/** `<<< ./quick-start/src/routes/todos.tsx#loader`, with an optional `[title]`. */
const includeLine =
	/^<<< (\.{1,2}\/[^\s#[]+)(?:#([\w-]+))?(?:[ \t]+\[([^\]]*)\])?[ \t]*$/gm;
const regionMarker = /^[ \t]*\/\/ ?#(region|endregion)\b[ \t]*([\w-]*)[ \t]*$/;
const queryMarker = /^[ \t]*\/\/\s*\^\?[ \t]*$/;

function dedent(lines: ReadonlyArray<string>) {
	const indents = lines
		.filter((line) => line.trim())
		.map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
	const indent = indents.length ? Math.min(...indents) : 0;
	return lines.map((line) => line.slice(indent));
}

interface Line {
	readonly shown: boolean;
	readonly text: string;
}

/**
 * Marks each line of `code` as in `region` or not (all of them when it's
 * undefined). A region can appear more than once, and its parts are shown
 * together. Every `// #region` / `// #endregion` line is dropped, and a
 * `// ^?` outside the region too, so a file can hold several regions with
 * their own queries.
 */
function markRegion(
	code: string,
	region: string | undefined,
	file: string,
): ReadonlyArray<Line> {
	const lines: Array<Line> = [];
	const open: Array<string> = [];
	let found = !region;
	for (const [index, text] of code.trimEnd().split("\n").entries()) {
		const marker = regionMarker.exec(text);
		if (!marker) {
			const shown = !region || open.includes(region);
			if (shown || !queryMarker.test(text)) {
				lines.push({ shown, text });
			}
			continue;
		}
		const [, kind, name = ""] = marker;
		if (kind === "region") {
			open.push(name);
			found ||= name === region;
			continue;
		}
		const closed = open.pop();
		if (closed === undefined || (name && name !== closed)) {
			throw new Error(
				`${file}:${index + 1}: "// #endregion ${name}" doesn't close a region`,
			);
		}
	}
	if (!found) {
		throw new Error(`${file}: no "// #region ${region}"`);
	}
	if (open.length) {
		throw new Error(`${file}: "// #region ${open.join(", ")}" isn't closed`);
	}
	return lines;
}

/**
 * The block's code: hidden runs of lines go between `// ---cut-start---`
 * and `// ---cut-end---`, the first one with the block's `// @filename`.
 */
function twoslashCode(lines: ReadonlyArray<Line>, filename: string) {
	const shown = dedent(lines.filter((line) => line.shown).map((l) => l.text));
	const code: Array<string> = [];
	let hidden: Array<string> = [`// @filename: ${filename}`];
	const flush = () => {
		if (hidden.some((text) => text.trim())) {
			code.push("// ---cut-start---", ...hidden, "// ---cut-end---");
		}
		hidden = [];
	};
	for (const line of lines) {
		if (line.shown) {
			flush();
			code.push(shown.shift() ?? "");
		} else {
			hidden.push(line.text);
		}
	}
	flush();
	return code.join("\n");
}

/**
 * A line `<<< ./page/src/file.tsx#name` includes the `// #region name` …
 * `// #endregion` part of a TypeScript file as a `twoslash` block (the
 * whole file without `#name`), like VitePress's code snippets. The rest of
 * the file is still compiled, hidden, in the file's folder, so its imports
 * resolve like they do in the editor.
 *
 * The file must be in an example app (see `exampleApps`), and the block
 * compiles in that app's project. Its title is the file's path inside the
 * app, so `src/file.tsx` here; `[title]` after the path replaces it, and
 * `[]` leaves it out.
 */
export function expandSnippets(
	markdown: string,
	options: {
		/** The page's `.md` file. */
		readonly file: string;
		/** The content dir, which holds the example apps. */
		readonly root: string;
	},
): ExpandedSnippets {
	const files: Array<string> = [];
	const expanded = markdown.replaceAll(
		includeLine,
		(_line, relative: string, region?: string, title?: string) => {
			const file = path.resolve(path.dirname(options.file), relative);
			const lang = path.extname(file).slice(1);
			if (lang !== "ts" && lang !== "tsx") {
				throw new Error(
					`${options.file}: can only include .ts and .tsx files, not ${relative}`,
				);
			}
			const app = appOf(file, options.root);
			if (!app) {
				throw new Error(
					`${options.file}: ${relative} isn't in an example app (a folder in content/ with a tsconfig.json)`,
				);
			}
			files.push(file);
			const lines = markRegion(readFileSync(file, "utf8"), region, file);
			const shownTitle =
				title ?? path.relative(app, file).split(path.sep).join("/");
			// Twoslash empties a block's files once it's done, so the block gets a
			// name of its own next to the file: other blocks importing the file
			// still read it from disk.
			const virtualPath = path
				.relative(
					options.root,
					`${file.slice(0, -lang.length - 1)}.${region ?? "file"}.twoslash.${lang}`,
				)
				.split(path.sep)
				.join("/");
			const meta = shownTitle ? ` title="${shownTitle}"` : "";
			return `\`\`\`${lang} twoslash${meta}\n${twoslashCode(lines, virtualPath)}\n\`\`\``;
		},
	);
	return { files, markdown: expanded };
}
