/**
 * The type switches, and the code they stand for with what TypeScript said
 * about it: squiggles, the errors under their lines, and each `// ^?`'s
 * type. `build/effect-query-configs.ts` compiled every combination ahead of
 * time, so this renders JSON.
 */
import { Button } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import { CircleCheck, CircleX } from "lucide-react";
import { type CSSProperties, Fragment, type ReactNode } from "react";

import {
	type Compiled,
	type Config,
	defaultConfig,
	type Generated,
	idOf,
	type Line,
	matters,
	switches,
} from "./configs.ts";
import { Toggle } from "./panel.tsx";
import { setConfig, useConfig } from "./switches.ts";
import json from "./type-configs.gen.json";

// SAFETY: `build/effect-query-configs.ts` writes this file from a `Generated`, and `typecheck` fails while it's out of date. JSON's arrays type as arrays, not tuples.
const generated = json as unknown as Generated;

const compiledOf = (config: Config): Compiled | undefined =>
	generated.configs[idOf(config)];

/** How many errors the compiler reports for a combination. */
export const errorsIn = (config: Config): number =>
	compiledOf(config)?.errors.length ?? 0;

const Group = (props: {
	readonly children: ReactNode;
	readonly title: string;
}) => (
	<div className="space-y-3">
		<span className="block text-xs font-medium text-muted-foreground">
			{props.title}
		</span>
		{props.children}
	</div>
);

export const TypesPanel = () => {
	const config = useConfig();
	const toggles = (from: number, to: number) =>
		switches.slice(from, to).map((entry) => (
			<Toggle
				checked={config[entry.key] && matters(config, entry.key)}
				disabled={!matters(config, entry.key)}
				hint={entry.hint}
				key={entry.key}
				onChange={(checked) => setConfig({ ...config, [entry.key]: checked })}
			>
				{entry.label}
			</Toggle>
		));
	return (
		<section className="space-y-4">
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
					Types
				</h2>
				<Button
					disabled={idOf(config) === idOf(defaultConfig)}
					onClick={() => setConfig(defaultConfig)}
					size="sm"
					variant="ghost"
				>
					Reset
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				Each switch rewrites the code under the demo, and what the compiler says
				about it. The app runs it anyway, with its types erased.
			</p>
			<Group title="What each boundary catches">{toggles(0, 5)}</Group>
			<Group title="How DocPage reads">{toggles(5, switches.length)}</Group>
		</section>
	);
};

interface TokenStyle extends CSSProperties {
	readonly "--shiki-dark"?: string;
	readonly "--shiki-light"?: string;
}

const themeStyle: TokenStyle = {
	"--shiki-dark": generated.theme.dark,
	"--shiki-light": generated.theme.light,
};

const textOf = (line: Line) => line.map(([text]) => text).join("");

/** The column a character starts at, with a tab two wide as on `.code-block pre`. */
const columnOf = (text: string, character: number) =>
	text.slice(0, character).replaceAll("\t", "  ").length;

interface Range {
	readonly from: number;
	readonly to: number;
}

/** A line's tokens, cut where an error starts or ends, with the errors' parts squiggled. */
const LineView = (props: {
	readonly errors: ReadonlyArray<Range>;
	readonly line: Line;
	readonly start: number;
}) => {
	const pieces: Array<ReactNode> = [];
	let offset = props.start;
	for (const [text, light, dark] of props.line) {
		const end = offset + text.length;
		const cuts = [
			offset,
			...props.errors
				.flatMap((range) => [range.from, range.to])
				.filter((at) => at > offset && at < end),
			end,
		].toSorted((a, b) => a - b);
		const style: TokenStyle | undefined =
			light === ""
				? undefined
				: { "--shiki-dark": dark, "--shiki-light": light };
		for (const [index, from] of cuts.slice(0, -1).entries()) {
			const to = cuts[index + 1] ?? end;
			if (to === from) {
				continue;
			}
			const piece = (
				<span key={from} style={style}>
					{text.slice(from - offset, to - offset)}
				</span>
			);
			pieces.push(
				props.errors.some((range) => range.from <= from && from < range.to) ? (
					<span className="twoslash-error" key={from}>
						{piece}
					</span>
				) : (
					piece
				),
			);
		}
		offset = end;
	}
	return <span className="line">{pieces}</span>;
};

const hoverLine = /^\s*\/\/\s*\^\?\s*$/;

const Code = (props: { readonly compiled: Compiled }) => {
	const lines = props.compiled.code.map(
		(index) => generated.lines[index] ?? [],
	);
	const texts = lines.map(textOf);
	const starts = texts.map((_text, index) =>
		texts.slice(0, index).reduce((sum, text) => sum + text.length + 1, 0),
	);
	const ranges = props.compiled.errors.map(([line, character, length]) => {
		const from = (starts[line] ?? 0) + character;
		return { from, to: from + Math.max(length, 1) };
	});
	const hovers = new Map(props.compiled.hovers);
	return (
		<div className="code-block code-wrap my-0!">
			<pre className="shiki twoslash" style={themeStyle}>
				<code>
					{lines.map((line, index) => {
						const text = texts[index] ?? "";
						const hover = hovers.get(index);
						const number = String(index + 1);
						if (hover !== undefined && hoverLine.test(text)) {
							return (
								<div
									className="twoslash-meta-line twoslash-query-line"
									key={number}
								>
									<span
										className="twoslash-popup-container"
										style={{
											marginLeft: `${Math.max(columnOf(text, text.indexOf("^")) - 1, 0)}ch`,
										}}
									>
										<span className="twoslash-popup-arrow" />
										<code className="twoslash-popup-code">
											{generated.texts[hover]}
										</code>
									</span>
								</div>
							);
						}
						return (
							<Fragment key={number}>
								<LineView
									errors={ranges}
									line={line}
									start={starts[index] ?? 0}
								/>
								{"\n"}
								{props.compiled.errors
									.filter((error) => error[0] === index)
									.map(([, character, , code, message]) => (
										<div
											className="twoslash-meta-line twoslash-error-line"
											key={`${character}:${code}`}
										>
											{`${generated.texts[message] ?? ""} (${code})`}
										</div>
									))}
							</Fragment>
						);
					})}
				</code>
			</pre>
		</div>
	);
};

/** The code the switches stand for, with what TypeScript said about it. */
export const CodePanel = () => {
	const config = useConfig();
	const compiled = compiledOf(config);
	if (compiled === undefined) {
		return null;
	}
	const errors = compiled.errors.length;
	return (
		<section className="space-y-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
					The code
				</h2>
				<span
					className={cn(
						"inline-flex items-center gap-1.5 text-sm font-medium",
						errors === 0
							? "text-emerald-700 dark:text-emerald-300"
							: "text-destructive",
					)}
				>
					{errors === 0 ? (
						<CircleCheck className="size-4" />
					) : (
						<CircleX className="size-4" />
					)}
					{errors === 0
						? "Compiles"
						: `${errors} ${errors === 1 ? "error" : "errors"}`}
				</span>
			</div>
			<p className="text-xs text-muted-foreground">
				TypeScript {generated.compiler} compiled this file in the docs’ sample
				app, for each combination of the switches, when the site was built. The
				errors and types are what it said.
			</p>
			<Code compiled={compiled} />
		</section>
	);
};
