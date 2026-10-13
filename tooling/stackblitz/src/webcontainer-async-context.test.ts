import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";

const preload = new URL("webcontainer-async-context.mjs", import.meta.url)
	.pathname;
const dir = mkdtempSync(join(tmpdir(), "stackblitz-preload-"));
const fakeWebContainer = join(dir, "fake-webcontainer.mjs");
writeFileSync(fakeWebContainer, 'process.versions.webcontainer = "test";\n');

/**
 * Reads each `AsyncLocalStorage` after its `run` returns, and spawns itself
 * once in another directory to check the preload carries over.
 */
const probe = join(dir, "probe.mjs");
writeFileSync(
	probe,
	`
import { execFileSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const esm = new AsyncLocalStorage();
const cjs = new (require("node:async_hooks").AsyncLocalStorage)();
esm.run("esm", () => {});
cjs.run("cjs", () => {});
const child = process.argv[2] === "child"
	? undefined
	: JSON.parse(execFileSync(process.execPath, [import.meta.filename, "child"], { cwd: "/", encoding: "utf8" }));
console.log(JSON.stringify({
	child,
	global: globalThis.AsyncLocalStorage === AsyncLocalStorage,
	preloads: process.env.NODE_OPTIONS.split(" ").filter((o) => o.endsWith("/webcontainer-async-context.mjs")),
	stores: [esm.getStore(), cjs.getStore()],
}));
`,
);

const run = (imports: ReadonlyArray<string>) =>
	JSON.parse(
		execFileSync(process.execPath, [probe], {
			cwd: dir,
			encoding: "utf8",
			env: {
				...process.env,
				NODE_OPTIONS: imports.map((file) => `--import=${file}`).join(" "),
			},
		}),
	);

describe("webcontainer-async-context", () => {
	it("falls back to the last entered store in WebContainers, in child processes too", () => {
		const result = {
			global: true,
			preloads: [`--import=file://${preload}`],
			stores: ["esm", "cjs"],
		};
		expect(run([fakeWebContainer, preload])).toEqual({
			child: result,
			...result,
		});
	});

	it("leaves AsyncLocalStorage alone elsewhere, and still reaches child processes", () => {
		const result = {
			global: false,
			preloads: [`--import=file://${preload}`],
			stores: [null, null],
		};
		expect(run([preload])).toEqual({ child: result, ...result });
	});
});
