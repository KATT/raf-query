#!/usr/bin/env node
/**
 * Compiles every combination of the type controls (`src/type-levels.ts`)
 * with TypeScript's language service, and writes what it says about each to
 * `src/type-levels.gen.json`: the diagnostics, as tsc prints them, and the
 * hover of each `docs` and `doc` binding. Each combination's code is a
 * virtual file in `src/`, so its imports resolve as the demo's do.
 *
 * Every combination that compiles must be one the live demo can run.
 *
 * `--check` fails instead of writing when the file is out of date.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Data, Effect, FileSystem, Path } from "effect";
import ts from "typescript6";

import {
	allLevels,
	type Compiled,
	codeFor,
	hidden,
	keyOf,
	type Levels,
	variantOf,
} from "../src/type-levels.ts";

class TypeLevelsError extends Data.TaggedError("TypeLevelsError")<{
	readonly message: string;
}> {}

const lineCount = (text: string) => text.split("\n").length - 1;

/** One language service over every combination's virtual file. */
const compile = (
	root: string,
	path: Path.Path,
	combinations: ReadonlyArray<Levels>,
) => {
	const config = ts.readConfigFile(
		path.join(root, "tsconfig.json"),
		ts.sys.readFile,
	);
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
	const files = new Map(
		combinations.map((levels) => {
			const code = codeFor(levels);
			return [
				path.join(root, "src", `type-level-${keyOf(levels)}.tsx`),
				{ code, levels, text: code + hidden },
			] as const;
		}),
	);
	const host: ts.LanguageServiceHost = {
		directoryExists: ts.sys.directoryExists,
		fileExists: (file) => files.has(file) || ts.sys.fileExists(file),
		getCompilationSettings: () => ({ ...parsed.options, noEmit: true }),
		getCurrentDirectory: () => root,
		getDefaultLibFileName: ts.getDefaultLibFilePath,
		getDirectories: ts.sys.getDirectories,
		getScriptFileNames: () => [...files.keys()],
		getScriptSnapshot: (file) => {
			const text = files.get(file)?.text ?? ts.sys.readFile(file);
			return text === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(text);
		},
		getScriptVersion: () => "1",
		readDirectory: ts.sys.readDirectory,
		readFile: (file) => files.get(file)?.text ?? ts.sys.readFile(file),
	};
	const service = ts.createLanguageService(host);
	const program = service.getProgram();
	if (program === undefined) {
		throw new Error("the language service made no program");
	}

	const compiled = new Map<string, Compiled>();
	for (const [file, { code, levels }] of files) {
		const source = program.getSourceFile(file);
		if (source === undefined) {
			throw new Error(`no source file for ${file}`);
		}
		const visible = lineCount(code);
		const at = (position: number) => {
			const found = source.getLineAndCharacterOfPosition(position);
			if (found.line >= visible) {
				throw new Error(
					`${path.basename(file)}: something at line ${found.line + 1} of the hidden part`,
				);
			}
			return { column: found.character, line: found.line + 1 };
		};
		const diagnostics = [
			...service.getSyntacticDiagnostics(file),
			...service.getSemanticDiagnostics(file),
		].map((diagnostic) => ({
			code: diagnostic.code,
			...at(diagnostic.start ?? 0),
			length: diagnostic.length ?? 0,
			message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
		}));
		const hovers: Array<Compiled["hovers"][number]> = [];
		const visit = (node: ts.Node): void => {
			if (
				ts.isVariableDeclaration(node) &&
				ts.isIdentifier(node.name) &&
				(node.name.text === "doc" || node.name.text === "docs")
			) {
				const start = node.name.getStart(source);
				const info = service.getQuickInfoAtPosition(file, start);
				hovers.push({
					...at(start),
					length: node.name.text.length,
					text: ts.displayPartsToString(info?.displayParts),
				});
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
		compiled.set(keyOf(levels), { diagnostics, hovers });
	}
	return compiled;
};

const program = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = path.join(import.meta.dirname, "..");
	const out = path.join(root, "src", "type-levels.gen.json");

	const combinations = allLevels();
	const compiled = yield* Effect.try({
		catch: (cause) => new TypeLevelsError({ message: String(cause) }),
		try: () => compile(root, path, combinations),
	});

	for (const levels of combinations) {
		const result = compiled.get(keyOf(levels));
		const variant = variantOf(levels);
		if (
			result !== undefined &&
			result.diagnostics.length === 0 &&
			(variant === undefined ||
				(variant === "docAccessAll") !== levels.notFound)
		) {
			return yield* new TypeLevelsError({
				message: `${keyOf(levels)} compiles, and the live demo has no chain for it:\n${codeFor(levels)}`,
			});
		}
	}

	const sorted = Object.fromEntries(
		[...compiled].toSorted(([a], [b]) => a.localeCompare(b)),
	);
	const json = `${JSON.stringify(sorted, null, "\t")}\n`;
	const relative = path.relative(root, out);
	if (process.argv.includes("--check")) {
		const current = yield* fs
			.readFileString(out)
			.pipe(Effect.orElseSucceed(() => ""));
		if (current !== json) {
			return yield* new TypeLevelsError({
				message: `${relative} is out of date: run \`pnpm type-levels\``,
			});
		}
		yield* Console.log(
			`${compiled.size} type-level combinations match ${relative}`,
		);
		return;
	}
	yield* fs.writeFileString(out, json);
	yield* Console.log(`wrote ${compiled.size} combinations to ${relative}`);
});

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
