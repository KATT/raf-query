#!/usr/bin/env node
/**
 * Bundle small entries (`fixtures/`) that each import a different slice of
 * raf-query, and print each one's gzip size and the opt-in features in it
 * as Markdown. React is external; the rest is minified with Vite (Rolldown).
 *
 * The run fails when:
 * - a bundle holds an opt-in feature its entry doesn't import (it didn't
 *   tree-shake), or lacks one it does (its marker is stale);
 * - the base entry (a client, `load` and `useQuery`) passes 5 kB gzip.
 *
 * Usage: node src/measure.ts [--dist]
 *   --dist  bundle the packages' built `dist/` (run `pnpm build` first),
 *           which is what npm users get.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Path } from "effect";

import { bundle } from "./bundle.ts";
import {
	budget,
	featureIds,
	features,
	hasFeature,
	scenarios,
} from "./scenarios.ts";

const kb = (bytes: number) => `${(bytes / 1024).toFixed(2)} kB`;

Effect.gen(function* () {
	const path = yield* Path.Path;
	const fixtures = path.join(import.meta.dirname, "../fixtures");
	const dist = process.argv.includes("--dist");

	const rows: Array<{
		readonly found: ReadonlyArray<string>;
		readonly gzip: number;
		readonly scenario: (typeof scenarios)[number];
	}> = [];
	const problems: Array<string> = [];
	for (const scenario of scenarios) {
		const output = yield* bundle(path.join(fixtures, scenario.fixture), {
			dist,
		});
		const present = featureIds.filter((feature) => hasFeature(output, feature));
		for (const feature of featureIds) {
			const imported = scenario.imports.includes(feature);
			if (imported && !present.includes(feature)) {
				problems.push(
					`${scenario.fixture} imports ${features[feature].label}, but its marker isn't in the bundle`,
				);
			}
			if (!imported && present.includes(feature)) {
				problems.push(
					`${scenario.fixture} doesn't import ${features[feature].label}, but the bundle holds it`,
				);
			}
		}
		if (scenario.fixture === budget.scenario && output.gzip > budget.gzip) {
			problems.push(
				`the base (${scenario.fixture}) is ${kb(output.gzip)} gzip, over its ${kb(budget.gzip)} budget`,
			);
		}
		rows.push({
			found: present.map((feature) => features[feature].label),
			gzip: output.gzip,
			scenario,
		});
	}

	yield* Console.log(
		`Each entry imports one slice of raf-query (${dist ? "built dist/" : "src/"}; React external; gzip).\n`,
	);
	const base = rows.find((row) => row.scenario.fixture === budget.scenario);
	yield* Console.log(
		`| Entry | gzip | Over ${base?.scenario.name.replace(/^\+ /, "") ?? "the base"} | Opt-in features in the bundle |`,
	);
	yield* Console.log("| --- | --: | --: | --- |");
	for (const row of rows) {
		const over =
			base === undefined || row === base || row.scenario.imports.length === 0
				? "—"
				: `+${kb(row.gzip - base.gzip)}`;
		yield* Console.log(
			`| ${row.scenario.name} | ${kb(row.gzip)} | ${over} | ${row.found.join(", ") || "none"} |`,
		);
	}
	const absent = featureIds.map((feature) => {
		const marker = features[feature].marker;
		const shown =
			"code" in marker ? `the string "${marker.code}"` : `\`${marker.module}\``;
		return `- ${features[feature].label}: ${shown}`;
	});
	yield* Console.log(
		[
			"",
			"Every opt-in feature is absent from the bundles that don't import it (the run fails otherwise). Markers:",
			...absent,
			"",
			`Base budget: ${budget.scenario} under ${kb(budget.gzip)} gzip.`,
		].join("\n"),
	);
	if (problems.length > 0) {
		return yield* Effect.fail(new Error(problems.join("\n")));
	}
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
