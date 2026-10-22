import { Switch } from "@examples/ui/components/switch";
import { cn } from "@examples/ui/lib/utils";
import type { ReactNode } from "react";

import type { SwitchId, TypeConfig } from "./switches.ts";
import { isDisabled, keyOf, normalize, typeSwitches } from "./switches.ts";
import generated from "./type-controls.gen.json";

interface Diagnostic {
	readonly code: number;
	readonly column: number;
	readonly length: number;
	readonly line: number;
	readonly message: string;
}

interface Query {
	readonly column: number;
	readonly line: number;
	readonly text: string;
}

interface Variant {
	readonly chain: string | null;
	readonly code: string;
	readonly diagnostics: ReadonlyArray<Diagnostic>;
	readonly queries: ReadonlyArray<Query>;
}

const variants: { readonly [key: string]: Variant | undefined } =
	generated.variants;

function variantOf(config: TypeConfig) {
	return variants[keyOf(config)];
}

export function TypeSwitches(props: {
	readonly config: TypeConfig;
	readonly onChange: (config: TypeConfig) => void;
}) {
	return (
		<div className="grid gap-2.5">
			<p className="text-xs font-medium">Change the types</p>
			{typeSwitches.map((each) => (
				<label
					className={cn(
						"flex items-start justify-between gap-3 text-sm",
						isDisabled(props.config, each.id) && "opacity-60",
					)}
					key={each.id}
				>
					<span className="font-medium">{each.label}</span>
					<Switch
						checked={props.config[each.id]}
						disabled={isDisabled(props.config, each.id)}
						onCheckedChange={(checked) => {
							props.onChange(set(props.config, each.id, checked));
						}}
						size="sm"
					/>
				</label>
			))}
		</div>
	);
}

function set(config: TypeConfig, id: SwitchId, on: boolean): TypeConfig {
	return normalize({ ...config, [id]: on });
}

/** Line `text`, with the ranges `tsc` reports on it underlined. */
function Squiggled(props: {
	readonly diagnostics: ReadonlyArray<Diagnostic>;
	readonly text: string;
}) {
	const chars = props.text.split("");
	const marked = chars.map(() => false);
	for (const diagnostic of props.diagnostics) {
		const start = diagnostic.column - 1;
		const end = Math.min(chars.length, start + Math.max(1, diagnostic.length));
		for (let index = start; index < end; index++) {
			marked[index] = true;
		}
	}
	const runs: Array<{ readonly error: boolean; readonly text: string }> = [];
	for (const [index, char] of chars.entries()) {
		const error = marked[index] ?? false;
		const last = runs.at(-1);
		if (last?.error === error) {
			runs[runs.length - 1] = { error, text: last.text + char };
		} else {
			runs.push({ error, text: char });
		}
	}
	return runs.map((run, index) =>
		run.error ? (
			<span
				className="underline decoration-destructive decoration-wavy decoration-from-font underline-offset-4"
				key={index}
			>
				{run.text}
			</span>
		) : (
			run.text
		),
	);
}

function Row(props: {
	readonly children: ReactNode;
	readonly className?: string;
	readonly number?: number;
}) {
	return (
		<div className="grid grid-cols-[2.25rem_minmax(0,1fr)]">
			<span className="pr-2 text-right text-muted-foreground/60 select-none">
				{props.number}
			</span>
			<span
				className={cn(
					"[overflow-wrap:anywhere] whitespace-pre-wrap",
					props.className,
				)}
			>
				{props.children}
			</span>
		</div>
	);
}

/** Each line with what `tsc` said about it. A `^?` line has no number, as in Twoslash. */
function linesOf(variant: Variant) {
	let number = 0;
	return variant.code
		.trimEnd()
		.split("\n")
		.map((text, index) => {
			const line = index + 1;
			const query = variant.queries.find((each) => each.line === line);
			if (query === undefined) {
				number += 1;
			}
			return {
				diagnostics: variant.diagnostics.filter((each) => each.line === line),
				line,
				number: query === undefined ? number : undefined,
				query,
				text,
			};
		});
}

/**
 * The chain and the component for `config`, as `tsc` saw them at build
 * time: its errors under the lines they're on, and the type at each `^?`.
 */
export function TypeCode(props: { readonly config: TypeConfig }) {
	const variant = variantOf(props.config);
	if (variant === undefined) {
		return null;
	}
	const errors = variant.diagnostics.length;
	return (
		<section aria-label="The code for these types" className="grid gap-2">
			<p
				className={cn(
					"text-sm",
					errors === 0
						? "text-emerald-700 dark:text-emerald-300"
						: "text-destructive",
				)}
				role="status"
			>
				{errors === 0
					? "Compiles. The app runs this configuration."
					: `${errors} type ${errors === 1 ? "error" : "errors"}: it doesn't compile, so the app runs the last configuration that did.`}
			</p>
			<pre className="rounded-lg border bg-muted/40 py-2 pr-2 font-mono text-[11px] leading-5 [tab-size:2] @lg:text-xs">
				{linesOf(variant).map((each) =>
					each.query === undefined ? (
						<div key={each.line}>
							<Row number={each.number}>
								<Squiggled diagnostics={each.diagnostics} text={each.text} />
							</Row>
							{each.diagnostics.map((diagnostic) => (
								<Row
									className="my-0.5 rounded border-l-2 border-destructive bg-destructive/5 px-2 py-0.5 text-destructive"
									key={`${diagnostic.column}:${diagnostic.code}`}
								>
									{`error TS${diagnostic.code}: ${diagnostic.message}`}
								</Row>
							))}
						</div>
					) : (
						<Row key={each.line}>
							<span className="text-muted-foreground">
								{each.text.slice(0, each.query.column - 1)}^{" "}
							</span>
							<span className="rounded bg-sky-500/10 px-1 text-sky-800 dark:text-sky-200">
								{each.query.text}
							</span>
						</Row>
					),
				)}
			</pre>
		</section>
	);
}
