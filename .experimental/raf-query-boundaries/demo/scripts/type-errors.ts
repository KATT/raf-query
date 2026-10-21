#!/usr/bin/env node
/**
 * Runs tsc over `type-errors/` and writes each fixture's source, with what the
 * compiler says about it, to `src/type-errors.gen.json` for the demo's "Type
 * errors" tab. A `.fails.tsx` fixture must not compile and a `.compiles.tsx`
 * one must.
 *
 * `--check` fails instead of writing when the file is out of date.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import {
	Array as Arr,
	Console,
	Data,
	Effect,
	FileSystem,
	Path,
	Stream,
	String as Str,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

class FixtureError extends Data.TaggedError("FixtureError")<{
	readonly message: string;
}> {}

interface Diagnostic {
	readonly code: string;
	readonly column: number;
	/** In `source`, 1-based. */
	readonly line: number;
	readonly message: string;
}

const diagnostic =
	/^(?<file>[^(]+)\((?<line>\d+),(?<column>\d+)\): error (?<code>TS\d+): (?<message>.*)$/;

/** tsc's `--pretty false` output: one `file(line,col): error TSn: message` line per diagnostic, indented lines continuing it. */
const parse = (output: string) => {
	const parsed: Array<Diagnostic & { readonly file: string }> = [];
	for (const line of Str.linesIterator(output)) {
		const match = diagnostic.exec(line);
		if (match?.groups !== undefined) {
			parsed.push({
				code: match.groups["code"] ?? "",
				column: Number(match.groups["column"]),
				file: match.groups["file"] ?? "",
				line: Number(match.groups["line"]),
				message: match.groups["message"] ?? "",
			});
		} else if (line.startsWith(" ") && parsed.length > 0) {
			const last = parsed.pop();
			if (last !== undefined) {
				parsed.push({ ...last, message: `${last.message}\n${line.trimEnd()}` });
			}
		}
	}
	return parsed;
};

/** The leading `/** … *\/` block: its first line is the title, the rest the description. */
const header = /^\/\*\*\n((?: \*.*\n)*?) \*\/\n/;

const tsc = Effect.fn("tsc")(function* (cwd: string) {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	const handle = yield* spawner.spawn(
		ChildProcess.make("tsc", ["-p", "type-errors", "--pretty", "false"], {
			cwd,
			stderr: "inherit",
		}),
	);
	const [stdout] = yield* Effect.all(
		[handle.stdout.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
		{
			concurrency: "unbounded",
		},
	);
	return stdout;
}, Effect.scoped);

const program = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = path.join(import.meta.dirname, "..");
	const dir = path.join(root, "type-errors");
	const out = path.join(root, "src", "type-errors.gen.json");

	const diagnostics = parse(yield* tsc(root));
	const files = (yield* fs.readDirectory(dir))
		.filter((file) => file.endsWith(".tsx"))
		.toSorted();

	const fixtures = yield* Effect.forEach(files, (file) =>
		Effect.gen(function* () {
			const text = yield* fs.readFileString(path.join(dir, file));
			const match = header.exec(text);
			if (match === null) {
				return yield* new FixtureError({
					message: `${file} needs a /** title … */ header`,
				});
			}
			const lines = Arr.map(Str.split(match[1] ?? "", "\n"), (line) =>
				line.replace(/^ \* ?/, ""),
			);
			const [title = "", ...rest] = lines;
			const skipped = Str.split(match[0], "\n").length - 1;
			const expect = file.endsWith(".fails.tsx") ? "fails" : "compiles";
			const errors = diagnostics
				.filter((d) => path.basename(d.file) === file)
				.map(({ file: _file, ...d }) => ({ ...d, line: d.line - skipped }));
			if (expect === "fails" && errors.length === 0) {
				return yield* new FixtureError({
					message: `${file} should fail to compile, and doesn't`,
				});
			}
			if (expect === "compiles" && errors.length > 0) {
				return yield* new FixtureError({
					message: `${file} should compile:\n${errors.map((e) => e.message).join("\n")}`,
				});
			}
			return {
				description: rest.join(" ").trim().replaceAll(/\s+/g, " "),
				errors,
				expect,
				file,
				source: text.slice(match[0].length),
				title,
			};
		}),
	);

	const json = `${JSON.stringify(fixtures, null, "\t")}\n`;
	if (process.argv.includes("--check")) {
		const current = yield* fs
			.readFileString(out)
			.pipe(Effect.orElseSucceed(() => ""));
		if (current !== json) {
			return yield* new FixtureError({
				message: `${path.relative(root, out)} is out of date: run \`pnpm type-errors\``,
			});
		}
		yield* Console.log(
			`${fixtures.length} type-error fixtures match ${path.relative(root, out)}`,
		);
		return;
	}
	yield* fs.writeFileString(out, json);
	yield* Console.log(
		`wrote ${fixtures.length} fixtures to ${path.relative(root, out)}`,
	);
});

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
