import { readFileSync } from "node:fs";
import path from "node:path";

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

/**
 * Splits `code` around `region` (the whole file when it's undefined). Every
 * `// #region` / `// #endregion` line is dropped, and a `// ^?` outside the
 * region too, so a file can hold several regions with their own queries.
 */
function splitRegion(code: string, region: string | undefined, file: string) {
	const before: Array<string> = [];
	const inside: Array<string> = [];
	const after: Array<string> = [];
	const open: Array<string> = [];
	let state: "before" | "inside" | "after" = region ? "before" : "inside";
	for (const [index, line] of code.trimEnd().split("\n").entries()) {
		const marker = regionMarker.exec(line);
		if (marker) {
			const [, kind, name = ""] = marker;
			if (kind === "region") {
				open.push(name);
				if (region && name === region && state === "before") {
					state = "inside";
				}
			} else {
				const closed = open.pop();
				if (closed === undefined || (name && name !== closed)) {
					throw new Error(
						`${file}:${index + 1}: "// #endregion ${name}" doesn't close a region`,
					);
				}
				if (region && closed === region && state === "inside") {
					state = "after";
				}
			}
			continue;
		}
		if (state === "inside") {
			inside.push(line);
		} else if (!queryMarker.test(line)) {
			(state === "before" ? before : after).push(line);
		}
	}
	if (region && state === "before") {
		throw new Error(`${file}: no "// #region ${region}"`);
	}
	if (open.length) {
		throw new Error(`${file}: "// #region ${open.join(", ")}" isn't closed`);
	}
	return { after, before, inside: dedent(inside) };
}

/**
 * A line `<<< ./page/src/file.tsx#name` includes the `// #region name` …
 * `// #endregion` part of a TypeScript file as a `twoslash` block (the
 * whole file without `#name`), like VitePress's code snippets. The rest of
 * the file is still compiled, as hidden setup, in the file's folder, so its
 * imports resolve like they do in the editor.
 *
 * The block's title is the file's path inside the page's folder
 * (`content/<page>/`), so `src/file.tsx` here; `[title]` after the path
 * replaces it, and `[]` leaves it out.
 */
export function expandSnippets(
	markdown: string,
	options: {
		/** The page's `.md` file. */
		readonly file: string;
		/** Where `twoslash` blocks resolve imports from. */
		readonly root: string;
	},
): ExpandedSnippets {
	const pageDir = options.file.slice(0, -".md".length);
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
			files.push(file);
			const { after, before, inside } = splitRegion(
				readFileSync(file, "utf8"),
				region,
				file,
			);
			const shownTitle =
				title ??
				(file.startsWith(`${pageDir}${path.sep}`)
					? path.relative(pageDir, file).split(path.sep).join("/")
					: undefined);
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
			const code = [
				`// @filename: ${virtualPath}`,
				...before,
				"// ---cut---",
				...inside,
				...(after.some((line) => line.trim())
					? ["// ---cut-after---", ...after]
					: []),
			];
			const meta = shownTitle ? ` title="${shownTitle}"` : "";
			return `\`\`\`${lang} twoslash${meta}\n${code.join("\n")}\n\`\`\``;
		},
	);
	return { files, markdown: expanded };
}
