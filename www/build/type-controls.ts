#!/usr/bin/env node
/**
 * Writes the typed-error-boundaries demo's chain and component for every
 * configuration of its type switches, compiles them next to the demo's files
 * with TypeScript, and saves the code, the errors and the `// ^?` types to
 * `src/demos/typed-error-boundaries/type-controls.gen.json`. The demo shows
 * them: the browser runs no compiler.
 *
 * `--check` fails instead of writing when the file is out of date.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Data, Effect, FileSystem, Path } from "effect";
import ts from "typescript6";

import {
	allTypeConfigs,
	keyOf,
	runnableChain,
	type TypeConfig,
} from "../src/demos/typed-error-boundaries/switches.ts";

class TypeControlsError extends Data.TaggedError("TypeControlsError")<{
	readonly message: string;
}> {}

const header = `import type { QueryHandle } from "@raf-query/react";
import { Boundary } from "@raf-query/react/boundary";
import { Match } from "effect";

import type { DocsClient } from "./client.ts";
import {
	Crashed,
	Offline,
	RequestAccess,
	RequestAccessOrSignIn,
	Restore,
	SignIn,
} from "./fallbacks.tsx";
import { docQuery } from "./queries.ts";
`;

interface Link {
	readonly fallback: string;
	readonly name: string;
	readonly tags: ReadonlyArray<string>;
}

function chainOf(config: TypeConfig): ReadonlyArray<Link> {
	const access = [
		...(config.access ? ["Forbidden"] : []),
		...(config.twice ? ["Unauthorized"] : []),
	];
	return [
		{ fallback: "Offline", name: "Network", tags: ["RpcClientError"] },
		...(config.session
			? [{ fallback: "SignIn", name: "Session", tags: ["Unauthorized"] }]
			: []),
		...(access.length > 0
			? [
					{
						fallback:
							access.length === 2
								? "RequestAccessOrSignIn"
								: config.access
									? "RequestAccess"
									: "SignIn",
						name: "DocAccess",
						tags: access,
					},
				]
			: []),
		...(config.exists
			? [{ fallback: "Restore", name: "DocExists", tags: ["DocNotFound"] }]
			: []),
	];
}

/** The part of the file the demo shows. */
function sourceOf(config: TypeConfig) {
	const links = chainOf(config);
	const innermost = links.at(-1)?.name ?? "App";
	const lines = [
		`import type { DocRpcs } from "./api.ts";`,
		``,
		`type AppError = Boundary.RpcErrors<typeof DocRpcs>;`,
		`//   ^?`,
		``,
		`const [App] = Boundary.root<DocsClient, AppError>({`,
		`	fallback: Crashed,`,
		`	name: "App",`,
		`});`,
	];
	let parent = "App";
	for (const link of links) {
		const hook = link.name === innermost ? `, use${link.name}` : "";
		lines.push(
			``,
			`const [${link.name}${hook}] = Boundary.catchErrors(${parent}, {`,
			`	fallback: ${link.fallback},`,
			`	name: "${link.name}",`,
			`	tags: [${link.tags.map((tag) => `"${tag}"`).join(", ")}],`,
			`});`,
		);
		parent = link.name;
	}
	lines.push(
		``,
		`export function DocPage(props: {`,
		`	readonly doc: QueryHandle<typeof docQuery>;`,
		`}) {`,
		`	const doc = use${innermost}(docQuery, props.doc);`,
		`	//    ^?`,
	);
	if (!config.exists && !config.unchecked) {
		lines.push(
			`	if (Boundary.isUnhandled(doc)) {`,
			`		return (`,
			`			<p>`,
			`				{Match.valueTags(doc.error, {`,
			`					DocNotFound: (missing) => \`No doc \${missing.docId}\`,`,
			`				})}`,
			`			</p>`,
			`		);`,
			`	}`,
		);
	}
	lines.push(`	return <h1>{doc.title}</h1>;`, `}`);
	return `${lines.join("\n")}\n`;
}

interface Diagnostic {
	readonly code: number;
	/** 1-based, in the shown code. */
	readonly column: number;
	readonly length: number;
	/** 1-based, in the shown code. */
	readonly line: number;
	readonly message: string;
}

interface Query {
	/** Of the `^`, 1-based. */
	readonly column: number;
	/** Of the `// ^?` line, 1-based, in the shown code. */
	readonly line: number;
	readonly text: string;
}

interface Variant {
	readonly chain: string | null;
	readonly code: string;
	readonly config: TypeConfig;
	readonly diagnostics: ReadonlyArray<Diagnostic>;
	readonly queries: ReadonlyArray<Query>;
}

const queryMarker = /^([ \t]*\/\/[ \t]*)\^\?[ \t]*$/;

/**
 * One language service over every variant, each a file in the demo's folder
 * so its imports resolve like the demo's. TypeScript's host reads
 * synchronously, so the files it doesn't own come from `ts.sys`.
 */
const compile = Effect.fn("compile")(function* (
	www: string,
	files: ReadonlyMap<string, string>,
) {
	const configFile = ts.getParsedCommandLineOfConfigFile(
		`${www}/tsconfig.json`,
		{},
		{ ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
	);
	if (configFile === undefined) {
		return yield* new TypeControlsError({
			message: "can't read www/tsconfig.json",
		});
	}
	const host: ts.LanguageServiceHost = {
		directoryExists: ts.sys.directoryExists,
		fileExists: (file) => files.has(file) || ts.sys.fileExists(file),
		getCompilationSettings: () => configFile.options,
		getCurrentDirectory: () => www,
		getDefaultLibFileName: ts.getDefaultLibFilePath,
		getDirectories: ts.sys.getDirectories,
		getScriptFileNames: () => [...files.keys()],
		getScriptSnapshot: (file) => {
			const text = files.get(file) ?? ts.sys.readFile(file);
			return text === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(text);
		},
		getScriptVersion: () => "0",
		readDirectory: ts.sys.readDirectory,
		readFile: (file) => files.get(file) ?? ts.sys.readFile(file),
		realpath: ts.sys.realpath,
	};
	return ts.createLanguageService(host);
});

const program = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const www = path.join(import.meta.dirname, "..");
	const dir = path.join(www, "src", "demos", "typed-error-boundaries");
	const out = path.join(dir, "type-controls.gen.json");
	const skipped = header.split("\n").length - 1;

	const configs = allTypeConfigs();
	const files = new Map(
		configs.map((config) => [
			path.join(dir, `type-controls-${keyOf(config)}.tsx`),
			header + sourceOf(config),
		]),
	);
	const service = yield* compile(www, files);

	const variants: Record<string, Variant> = {};
	for (const config of configs) {
		const key = keyOf(config);
		const file = path.join(dir, `type-controls-${key}.tsx`);
		const source = service.getProgram()?.getSourceFile(file);
		if (source === undefined) {
			return yield* new TypeControlsError({ message: `${key}: not compiled` });
		}
		const diagnostics = [
			...service.getSyntacticDiagnostics(file),
			...service.getSemanticDiagnostics(file),
		].map((diagnostic) => {
			const start = diagnostic.start ?? 0;
			const at = source.getLineAndCharacterOfPosition(start);
			return {
				code: diagnostic.code,
				column: at.character + 1,
				length: diagnostic.length ?? 0,
				line: at.line + 1 - skipped,
				message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
			};
		});
		const hidden = diagnostics.find((diagnostic) => diagnostic.line < 1);
		if (hidden !== undefined) {
			return yield* new TypeControlsError({
				message: `${key}: an error in the hidden imports: ${hidden.message}`,
			});
		}
		const chain = runnableChain(config) ?? null;
		if ((chain !== null) !== (diagnostics.length === 0)) {
			return yield* new TypeControlsError({
				message:
					chain === null
						? `${key} compiles, and the demo has no chain to run it`
						: `${key} is chain ${chain}, and doesn't compile: ${diagnostics.map((d) => d.message).join("\n")}`,
			});
		}
		const code = sourceOf(config);
		const lines = code.split("\n");
		const queries: Array<Query> = [];
		for (const [index, line] of lines.entries()) {
			const marker = queryMarker.exec(line);
			if (marker === null) {
				continue;
			}
			const column = marker[1]?.length ?? 0;
			const position = source.getPositionOfLineAndCharacter(
				index - 1 + skipped,
				column,
			);
			const info = service.getQuickInfoAtPosition(file, position);
			if (info === undefined) {
				return yield* new TypeControlsError({
					message: `${key}:${index + 1}: nothing to show under the ^?`,
				});
			}
			queries.push({
				column: column + 1,
				line: index + 1,
				text: ts.displayPartsToString(info.displayParts),
			});
		}
		variants[key] = { chain, code, config, diagnostics, queries };
	}

	const generated = { variants };
	const json = `${JSON.stringify(generated, null, "\t")}\n`;
	const relative = path.relative(www, out);
	if (process.argv.includes("--check")) {
		const current = yield* fs.readFileString(out).pipe(
			Effect.flatMap((text) =>
				Effect.try(() => JSON.stringify(JSON.parse(text))),
			),
			Effect.orElseSucceed(() => ""),
		);
		// Compared parsed, so formatting the file doesn't make it stale.
		if (current !== JSON.stringify(generated)) {
			return yield* new TypeControlsError({
				message: `${relative} is out of date: run \`pnpm type-controls\` in www`,
			});
		}
		yield* Console.log(
			`${configs.length} type configurations match ${relative}`,
		);
		return;
	}
	yield* fs.writeFileString(out, json);
	yield* Console.log(
		`wrote ${configs.length} type configurations to ${relative}`,
	);
});

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
