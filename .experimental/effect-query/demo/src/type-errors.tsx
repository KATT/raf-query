/**
 * The "Type errors" tab: the fixtures in `type-errors/`, with what tsc said
 * about each one. `scripts/type-errors.ts` writes the JSON; `pnpm typecheck`
 * fails when it is out of date.
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

import fixtures from "./type-errors.gen.json";

/** Renders `` `code` `` spans in a fixture's title or description. */
const Prose = (props: { readonly text: string }) =>
	props.text
		.split("`")
		.map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part));

const Fixture = (props: { readonly fixture: (typeof fixtures)[number] }) => {
	const fixture = props.fixture;
	const lines = fixture.source.replace(/\n$/, "").split("\n");
	const errorLines = new Set(fixture.errors.map((error) => error.line));
	const fails = fixture.expect === "fails";
	return (
		<article className="space-y-3 rounded-xl border p-4">
			<header className="space-y-1">
				<div className="flex items-center gap-2">
					{fails ? (
						<CircleX className="size-4 text-destructive" />
					) : (
						<CircleCheck className="size-4 text-emerald-600" />
					)}
					<h3 className="font-semibold">
						<Prose text={fixture.title} />
					</h3>
					<Badge
						className="ms-auto"
						variant={fails ? "destructive" : "secondary"}
					>
						{fails ? "doesn't compile" : "compiles"}
					</Badge>
				</div>
				<p className="text-sm text-muted-foreground">
					<Prose text={fixture.description} />
				</p>
			</header>
			<CodeBlock size="sm">
				<CodeBlockHeader>
					<CodeBlockTitle>type-errors/{fixture.file}</CodeBlockTitle>
				</CodeBlockHeader>
				<CodeBlockContent lineNumbers>
					{lines.map((line, i) => (
						<CodeBlockLine
							key={i}
							variant={errorLines.has(i + 1) ? "removed" : "default"}
						>
							{line}
						</CodeBlockLine>
					))}
				</CodeBlockContent>
			</CodeBlock>
			{fixture.errors.map((error) => (
				<pre
					className="overflow-x-auto rounded-md bg-destructive/10 p-3 font-mono text-xs whitespace-pre-wrap text-destructive"
					key={`${error.line}:${error.column}`}
				>
					{`line ${error.line}, column ${error.column}: error ${error.code}: ${error.message}`}
				</pre>
			))}
		</article>
	);
};

export const TypeErrors = () => (
	<div className="space-y-4">
		<p className="max-w-3xl text-sm text-muted-foreground">
			These files sit next to the demo and import its boundaries and queries.
			tsc ran over them; this is what it said. Change a boundary and the
			messages change with it: <code>pnpm typecheck</code> fails until{" "}
			<code>pnpm type-errors</code> rewrites them.
		</p>
		<div className="grid gap-4 xl:grid-cols-2">
			{fixtures.map((fixture) => (
				<Fixture fixture={fixture} key={fixture.file} />
			))}
		</div>
	</div>
);
