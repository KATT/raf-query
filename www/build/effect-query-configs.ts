#!/usr/bin/env node
/**
 * Compiles every combination of the effect-query demo's type switches
 * (`src/demos/effect-query-boundaries/configs.ts`) in the docs sample app it
 * stands for, `samples/effect-query`, and writes each one's highlighted code,
 * TypeScript's errors and its `// ^?` types to `type-configs.gen.json` next
 * to the switches. The demo shows them, so the browser gets no compiler.
 *
 * `--check` fails instead of writing when the file is out of date, so
 * `typecheck` and `build` fail until it's rewritten.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Data, Effect, FileSystem, Path } from "effect";
import { codeToTokens } from "shiki";
import ts from "typescript6";

import {
	allConfigs,
	codeOf,
	type Compiled,
	type Config,
	defaultConfig,
	type Diagnostic,
	type Generated,
	type Hover,
	idOf,
	type Line,
} from "../src/demos/effect-query-boundaries/configs.ts";

class ConfigsError extends Data.TaggedError("ConfigsError")<{
	readonly message: string;
}> {}

const hoverLine = /^\s*\/\/\s*\^\?\s*$/;

/** Each value of `values` once, in order: `index` is where it is. */
const interner = <T>(keyOf: (value: T) => string) => {
	const indices = new Map<string, number>();
	const values: Array<T> = [];
	return {
		index: (value: T) => {
			const key = keyOf(value);
			const existing = indices.get(key);
			if (existing !== undefined) {
				return existing;
			}
			indices.set(key, values.length);
			values.push(value);
			return values.length - 1;
		},
		values,
	};
};

const languageService = (
	sample: string,
	files: ReadonlyMap<string, string>,
) => {
	const read = (name: string) => files.get(name) ?? ts.sys.readFile(name);
	return Effect.gen(function* () {
		const tsconfig = `${sample}/tsconfig.json`;
		const parsed = ts.getParsedCommandLineOfConfigFile(tsconfig, undefined, {
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: () => {},
		});
		if (!parsed || parsed.errors.length > 0) {
			return yield* new ConfigsError({
				message: `${tsconfig}: ${parsed?.errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n") ?? "invalid tsconfig"}`,
			});
		}
		return ts.createLanguageService(
			{
				directoryExists: ts.sys.directoryExists,
				fileExists: (name) => files.has(name) || ts.sys.fileExists(name),
				getCompilationSettings: () => parsed.options,
				getCurrentDirectory: () => sample,
				getDefaultLibFileName: ts.getDefaultLibFilePath,
				getDirectories: ts.sys.getDirectories,
				getScriptFileNames: () => [...parsed.fileNames, ...files.keys()],
				getScriptSnapshot: (name) => {
					const text = read(name);
					return text === undefined
						? undefined
						: ts.ScriptSnapshot.fromString(text);
				},
				getScriptVersion: () => "0",
				readDirectory: ts.sys.readDirectory,
				readFile: read,
			},
			ts.createDocumentRegistry(),
		);
	});
};

const entries = (rows: ReadonlyArray<string>) =>
	rows.map((row) => `\t\t${row}`).join(",\n");

/** The JSON, a config or a line per line, so a change's diff shows which. */
const serialize = (output: Generated) => {
	return [
		"{",
		`\t"compiler": ${JSON.stringify(output.compiler)},`,
		'\t"configs": {',
		entries(
			Object.entries(output.configs).map(
				([id, compiled]) =>
					`${JSON.stringify(id)}: ${JSON.stringify(compiled)}`,
			),
		),
		"\t},",
		'\t"lines": [',
		entries(output.lines.map((line) => JSON.stringify(line))),
		"\t],",
		'\t"texts": [',
		entries(output.texts.map((text) => JSON.stringify(text))),
		"\t],",
		`\t"theme": ${JSON.stringify(output.theme)}`,
		"}",
		"",
	].join("\n");
};

const program = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const www = path.join(import.meta.dirname, "..");
	const sample = path.join(www, "samples", "effect-query");
	const out = path.join(
		www,
		"src",
		"demos",
		"effect-query-boundaries",
		"type-configs.gen.json",
	);

	const configs = allConfigs();
	const fileOf = (config: Config) =>
		path.join(sample, "src", "configs", `${idOf(config)}.tsx`);
	const files = new Map(
		configs.map((config) => [fileOf(config), codeOf(config)]),
	);
	const service = yield* languageService(sample, files);
	const texts = interner((text: string) => text);
	const lines = interner((line: Line) => line.map(([text]) => text).join(""));
	// Types print with the sample's absolute paths where they aren't in scope.
	const scrub = (text: string) => text.replaceAll(`${sample}/`, "");

	const compiled: Record<string, Compiled> = {};
	const theme = { dark: "", light: "" };
	for (const config of configs) {
		const file = fileOf(config);
		const code = files.get(file) ?? "";
		const source = service.getProgram()?.getSourceFile(file);
		if (source === undefined) {
			return yield* new ConfigsError({ message: `${file} isn't compiled` });
		}
		const errors = [
			...service.getSyntacticDiagnostics(file),
			...service.getSemanticDiagnostics(file),
		]
			.map((diagnostic): Diagnostic => {
				const start = diagnostic.start ?? 0;
				const at = source.getLineAndCharacterOfPosition(start);
				return [
					at.line,
					at.character,
					diagnostic.length ?? 0,
					diagnostic.code,
					texts.index(
						scrub(
							ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
						),
					),
				];
			})
			.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
		const codeLines = code.split("\n");
		const hovers = codeLines.flatMap((line, index): Array<Hover> => {
			if (!hoverLine.test(line) || index === 0) {
				return [];
			}
			const position =
				source.getPositionOfLineAndCharacter(index - 1, 0) + line.indexOf("^");
			const info = service.getQuickInfoAtPosition(file, position);
			return info === undefined
				? []
				: [
						[
							index,
							texts.index(scrub(ts.displayPartsToString(info.displayParts))),
						],
					];
		});
		const tokens = yield* Effect.promise(() =>
			codeToTokens(code, {
				defaultColor: false,
				lang: "tsx",
				themes: { dark: "github-dark", light: "github-light" },
			}),
		);
		const colors = new Map(
			(tokens.rootStyle || "").split(";").map((entry): [string, string] => {
				const [name = "", value = ""] = entry.split(":");
				return [name, value];
			}),
		);
		theme.dark = colors.get("--shiki-dark") ?? "";
		theme.light = colors.get("--shiki-light") ?? "";
		compiled[idOf(config)] = {
			code: tokens.tokens.map((line) =>
				lines.index(
					line.map((token) => [
						token.content,
						String(token.htmlStyle?.["--shiki-light"] ?? ""),
						String(token.htmlStyle?.["--shiki-dark"] ?? ""),
					]),
				),
			),
			errors,
			hovers,
		};
	}

	const shown = compiled[idOf(defaultConfig)];
	if (shown === undefined || shown.errors.length > 0) {
		return yield* new ConfigsError({
			message: `the default combination should compile:\n${shown?.errors.map((error) => texts.values[error[4]]).join("\n")}`,
		});
	}

	const json = serialize({
		compiler: ts.version,
		configs: compiled,
		lines: lines.values,
		texts: texts.values,
		theme,
	});
	const failing = Object.values(compiled).filter(
		(config) => config.errors.length > 0,
	).length;
	const summary = `${configs.length} combinations, ${failing} that don't compile`;
	if (process.argv.includes("--check")) {
		const current = yield* fs
			.readFileString(out)
			.pipe(Effect.orElseSucceed(() => ""));
		if (current !== json) {
			return yield* new ConfigsError({
				message: `${path.relative(www, out)} is out of date: run \`node build/effect-query-configs.ts\``,
			});
		}
		yield* Console.log(`${path.relative(www, out)} is up to date: ${summary}`);
		return;
	}
	yield* fs.writeFileString(out, json);
	yield* Console.log(`wrote ${path.relative(www, out)}: ${summary}`);
});

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
