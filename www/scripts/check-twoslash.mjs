/**
 * Compile every content/*.md page and report Twoslash / markdown errors.
 * Usage: node scripts/check-twoslash.mjs [slug...]
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderMarkdown } from "../build/markdown.ts";

const contentDir = fileURLToPath(new URL("../content/", import.meta.url));
const args = process.argv.slice(2);
const files = readdirSync(contentDir)
	.filter((name) => name.endsWith(".md") && !name.startsWith("_"))
	.filter(
		(name) => args.length === 0 || args.includes(name.replace(/\.md$/, "")),
	);

let failed = 0;
for (const name of files) {
	const file = path.join(contentDir, name);
	const raw = readFileSync(file, "utf8");
	const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
	try {
		const result = await renderMarkdown(body, { twoslashRoot: contentDir });
		const twoslash = result.segments
			.filter((segment) => segment.kind === "html")
			.reduce(
				(count, segment) =>
					count + (segment.html.match(/twoslash lsp/g)?.length ?? 0),
				0,
			);
		console.log(`ok  ${name}  (${twoslash} twoslash blocks)`);
	} catch (error) {
		failed++;
		console.error(`FAIL ${name}`);
		console.error(error instanceof Error ? error.message : error);
	}
}
process.exit(failed === 0 ? 0 : 1);
