/**
 * The type controls' two halves: the switches, and the code they give with
 * what TypeScript says about it, under the lines it says it about. Every
 * combination was compiled ahead of time (`scripts/type-levels.ts`).
 */
import { Badge } from "@examples/ui/components/badge";
import {
	CodeBlock,
	CodeBlockContent,
	CodeBlockHeader,
	CodeBlockLine,
	CodeBlockTitle,
} from "@examples/ui/components/code-block";
import { CircleCheck, CircleX } from "lucide-react";
import { Fragment } from "react";

import { Toggle } from "./panel.tsx";
import compiledJson from "./type-levels.gen.json";
import {
	applies,
	type Compiled,
	codeFor,
	keyOf,
	type Levels,
	switches,
	variantOf,
} from "./type-levels.ts";

const compiled = new Map<string, Compiled>(Object.entries(compiledJson));

export const compiledFor = (levels: Levels): Compiled | undefined =>
	compiled.get(keyOf(levels));

/** The live demo's chain for `levels`, when they compile and it has one. */
export const runnable = (levels: Levels) =>
	compiledFor(levels)?.diagnostics.length === 0 ? variantOf(levels) : undefined;

export type Variant = NonNullable<ReturnType<typeof variantOf>>;

/** Renders `` `code` `` spans. */
const Prose = (props: { readonly text: string }) =>
	props.text
		.split("`")
		.map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part));

export const TypeSwitches = (props: {
	readonly levels: Levels;
	readonly onChange: (levels: Levels) => void;
}) => (
	<section className="space-y-4">
		<h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
			Types
		</h2>
		<p className="text-xs text-muted-foreground">
			Change how the boundaries and components are written. When the code
			compiles, the live demo runs it.
		</p>
		{switches.map((s) => (
			<Toggle
				checked={props.levels[s.id]}
				disabled={!applies(props.levels, s.id)}
				hint={<code className="font-mono text-[11px]">{s.hint}</code>}
				key={s.id}
				onChange={(checked) =>
					props.onChange({ ...props.levels, [s.id]: checked })
				}
			>
				<Prose text={s.label} />
			</Toggle>
		))}
	</section>
);

/** Columns count a tab as one character; the code shows it as two spaces. */
const visualColumn = (line: string, column: number) =>
	column + line.slice(0, column).split("\t").length - 1;

interface Span {
	readonly column: number;
	readonly length: number;
}

/** `line`, with the characters `spans` cover marked, in runs. */
const runs = (line: string, spans: ReadonlyArray<Span>) => {
	const marked = Array.from(line, () => false);
	for (const span of spans) {
		const end = Math.min(line.length, span.column + Math.max(span.length, 1));
		for (let i = span.column; i < end; i++) {
			marked[i] = true;
		}
	}
	const parts: Array<{ marked: boolean; text: string }> = [];
	for (let i = 0; i < line.length; i++) {
		const char = line[i] === "\t" ? "  " : (line[i] ?? "");
		const last = parts.at(-1);
		if (last !== undefined && last.marked === marked[i]) {
			last.text += char;
		} else {
			parts.push({ marked: marked[i] ?? false, text: char });
		}
	}
	return parts;
};

const Line = (props: {
	readonly errors: ReadonlyArray<Span>;
	readonly line: string;
}) =>
	runs(props.line, props.errors).map((part, i) =>
		part.marked ? (
			<span
				className="underline decoration-destructive decoration-wavy underline-offset-4"
				key={i}
			>
				{part.text}
			</span>
		) : (
			<Fragment key={i}>{part.text}</Fragment>
		),
	);

export const TypeCode = (props: {
	readonly levels: Levels;
	readonly running: Variant;
}) => {
	const code = codeFor(props.levels);
	const result = compiledFor(props.levels);
	const lines = code.replace(/\n$/, "").split("\n");
	const errors = result?.diagnostics ?? [];
	const compiles = result !== undefined && errors.length === 0;
	return (
		<section className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				{compiles ? (
					<CircleCheck className="size-4 text-emerald-600" />
				) : (
					<CircleX className="size-4 text-destructive" />
				)}
				<p className="text-sm font-medium">
					{result === undefined
						? "Not compiled: run `pnpm type-levels`."
						: compiles
							? "Compiles. The live demo runs this code."
							: `${errors.length} ${errors.length === 1 ? "error" : "errors"}. The live demo keeps running the last code that compiled.`}
				</p>
				<Badge className="ms-auto" variant="secondary">
					running: DocAccess catches{" "}
					{props.running === "docAccessAll"
						? "Forbidden, DocNotFound"
						: "Forbidden"}
				</Badge>
			</div>
			<CodeBlock size="sm">
				<CodeBlockHeader>
					<CodeBlockTitle>boundaries and pages, as written</CodeBlockTitle>
				</CodeBlockHeader>
				<CodeBlockContent lineNumbers wrap>
					{lines.map((line, i) => {
						const here = errors.filter((error) => error.line === i + 1);
						const hovers = (result?.hovers ?? []).filter(
							(hover) => hover.line === i + 1,
						);
						return (
							<Fragment key={i}>
								<CodeBlockLine
									variant={here.length > 0 ? "removed" : "default"}
								>
									<Line errors={here} line={line} />
								</CodeBlockLine>
								{hovers.map((hover) => (
									<span
										className="col-start-2 my-1 block"
										key={`hover:${hover.column}`}
										style={{
											paddingInlineStart: `${visualColumn(line, hover.column)}ch`,
										}}
									>
										<span className="text-muted-foreground select-none">
											^?{" "}
										</span>
										<span className="inline-block max-w-full rounded-md border bg-popover px-2 py-1 align-top whitespace-pre-wrap text-popover-foreground shadow-sm">
											{hover.text}
										</span>
										{hover.text.includes("Unhandled<") ? null : (
											<Badge className="ms-2 align-top" variant="secondary">
												plain data
											</Badge>
										)}
									</span>
								))}
								{here.map((error) => (
									<span
										className="col-start-2 my-1 block rounded-md bg-destructive/10 px-2 py-1 whitespace-pre-wrap wrap-break-word text-destructive"
										key={`error:${error.column}:${error.code}`}
									>
										error TS{error.code}: {error.message}
									</span>
								))}
							</Fragment>
						);
					})}
				</CodeBlockContent>
			</CodeBlock>
			<p className="text-xs text-muted-foreground">
				TypeScript compiled all {compiled.size} combinations of the switches
				when the demo was built. These are its messages and hovers; no compiler
				runs in the browser.
			</p>
		</section>
	);
};
